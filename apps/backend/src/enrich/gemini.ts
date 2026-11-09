import type { EnrichSource } from "@cellarboss/types";
import {
  lookupJsonSchema,
  lookupResponseSchema,
  type LookupResponse,
} from "./schema.js";
import {
  lookupPrompt,
  researchPrompt,
  structurePrompt,
  type LookupSubject,
} from "./prompt.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 120_000;

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }

  /**
   * A bad key, an unknown model or a used-up quota: every later call would
   * fail the same way, so a run stops rather than marking each vintage.
   */
  get fatal(): boolean {
    return [401, 403, 404, 429].includes(this.status);
  }
}

export interface LookupOutcome {
  response: LookupResponse;
  sources: EnrichSource[];
}

type FetchFn = typeof fetch;

interface GenerateResult {
  text: string;
  sources: EnrichSource[];
}

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
  groundingMetadata?: {
    groundingChunks?: { web?: { uri?: string; title?: string } }[];
  };
}

/**
 * Asks Gemini about one vintage, with Google Search grounding so the answer
 * rests on real pages, and returns it in the lookup JSON shape.
 *
 * It first asks for search and JSON together. Models that refuse that
 * combination get two calls instead: a search that writes notes, then a
 * call that turns the notes into JSON.
 */
export class GeminiClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async lookup(model: string, subject: LookupSubject): Promise<LookupOutcome> {
    let result: GenerateResult;
    try {
      result = await this.generate(model, lookupPrompt(subject), {
        search: true,
        json: true,
      });
    } catch (err) {
      if (!(err instanceof GeminiError) || err.status !== 400) throw err;
      const research = await this.generate(model, researchPrompt(subject), {
        search: true,
        json: false,
      });
      const structured = await this.generate(
        model,
        structurePrompt(subject, research.text),
        { search: false, json: true },
      );
      result = { text: structured.text, sources: research.sources };
    }
    return { response: parseResponse(result.text), sources: result.sources };
  }

  private async generate(
    model: string,
    prompt: string,
    opts: { search: boolean; json: boolean },
  ): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    };
    if (opts.search) body.tools = [{ google_search: {} }];
    if (opts.json)
      body.generationConfig = {
        responseMimeType: "application/json",
        responseJsonSchema: lookupJsonSchema(),
      };

    const res = await this.fetchFn(
      `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    const data = (await res.json().catch(() => null)) as {
      candidates?: GeminiCandidate[];
      error?: { message?: string };
      promptFeedback?: { blockReason?: string };
    } | null;
    if (!res.ok)
      throw new GeminiError(
        data?.error?.message ?? `Gemini returned ${res.status}`,
        res.status,
      );

    const candidate = data?.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    if (!text)
      throw new GeminiError(
        `Gemini gave no answer (${data?.promptFeedback?.blockReason ?? candidate?.finishReason ?? "empty"})`,
        502,
      );
    return { text, sources: groundingSources(candidate) };
  }
}

function groundingSources(candidate: GeminiCandidate | undefined) {
  const seen = new Set<string>();
  const sources: EnrichSource[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ uri, title: chunk.web?.title ?? null });
  }
  return sources;
}

/** Parses the model's JSON, allowing a ```json fence around it. */
export function parseResponse(text: string): LookupResponse {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new GeminiError("Gemini's answer wasn't valid JSON", 502);
  }
  const parsed = lookupResponseSchema.safeParse(json);
  if (!parsed.success)
    throw new GeminiError("Gemini's answer didn't match the schema", 502);
  return parsed.data;
}
