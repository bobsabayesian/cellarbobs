import { describe, it, expect } from "vitest";
import {
  cleanScores,
  estimateWindow,
  lookupWindow,
  scoreToPoints,
} from "../normalise.js";
import { GeminiClient, GeminiError, parseResponse } from "../gemini.js";
import { lookupJsonSchema } from "../schema.js";
import type { LookupSubject } from "../prompt.js";

const source = [{ uri: "https://example.com/review", title: "example.com" }];

describe("scoreToPoints", () => {
  it.each([
    ["97/100", 97],
    ["97", 97],
    ["95+", 95],
    ["94-96", 94],
    ["18.5/20", 93],
    ["17/20", 85],
    ["4.2/5", null],
    ["9/10", null],
    ["Gold", null],
    ["120/100", null],
  ])("%s → %s", (score, points) => {
    expect(scoreToPoints(score)).toBe(points);
  });
});

describe("cleanScores", () => {
  it("keeps one score per critic, highest first, with safe links", () => {
    const scores = cleanScores(
      {
        found: true,
        scores: [
          {
            critic: "Jancis Robinson",
            score: "17/20",
            sourceUrl: "javascript:alert(1)",
          },
          {
            critic: "James Suckling",
            score: "97/100",
            sourceUrl: "https://jamessuckling.com/x",
          },
          { critic: "james suckling", score: "90/100" },
        ],
      },
      source,
    );
    expect(scores).toEqual([
      {
        critic: "James Suckling",
        score: "97/100",
        points: 97,
        sourceUrl: "https://jamessuckling.com/x",
      },
      {
        critic: "Jancis Robinson",
        score: "17/20",
        points: 85,
        sourceUrl: null,
      },
    ]);
  });

  it("drops every score when the lookup searched nothing", () => {
    expect(
      cleanScores({ found: true, scores: [{ critic: "X", score: "99" }] }, []),
    ).toEqual([]);
  });
});

describe("lookupWindow", () => {
  const window = (drinkFrom: number, drinkUntil: number) => ({
    found: true,
    profile: { serving: { drinkFrom, drinkUntil } },
  });

  it("accepts a sensible window", () => {
    expect(lookupWindow(window(2024, 2045), 2017)).toEqual({
      drinkFrom: 2024,
      drinkUntil: 2045,
    });
  });

  it("rejects a window before the harvest or the wrong way round", () => {
    expect(lookupWindow(window(2010, 2020), 2017)).toBeNull();
    expect(lookupWindow(window(2030, 2025), 2017)).toBeNull();
  });
});

describe("estimateWindow", () => {
  it("averages how long after harvest the other vintages open and close", () => {
    expect(
      estimateWindow(2020, [
        { year: 2015, drinkFrom: 2020, drinkUntil: 2035 }, // +5, +20
        { year: 2016, drinkFrom: 2023, drinkUntil: 2038 }, // +7, +22
        { year: 2018, drinkFrom: null, drinkUntil: 2030 }, // no full window
        { year: null, drinkFrom: 2020, drinkUntil: 2025 }, // NV
      ]),
    ).toEqual({ drinkFrom: 2026, drinkUntil: 2041, basedOn: 2 });
  });

  it("needs a year and another vintage with a window", () => {
    expect(
      estimateWindow(null, [{ year: 2015, drinkFrom: 2020, drinkUntil: 2030 }]),
    ).toBeNull();
    expect(estimateWindow(2020, [])).toBeNull();
  });
});

describe("parseResponse", () => {
  it("reads JSON in a code fence and allows missing fields", () => {
    expect(parseResponse('```json\n{"found": true}\n```')).toEqual({
      found: true,
    });
  });

  it("rejects anything else", () => {
    expect(() => parseResponse("Sorry, I can't")).toThrow(GeminiError);
    expect(() => parseResponse('{"found": "yes"}')).toThrow(GeminiError);
  });
});

describe("lookupJsonSchema", () => {
  it("is plain JSON Schema with the top-level fields", () => {
    const schema = lookupJsonSchema();
    expect(schema.$schema).toBeUndefined();
    expect(Object.keys(schema.properties as object)).toEqual([
      "found",
      "profile",
      "scores",
    ]);
  });
});

describe("GeminiClient", () => {
  const subject: LookupSubject = {
    producer: "Roberto Voerzio",
    wine: "Barolo del Comune di La Morra",
    year: 2017,
    type: "red",
    region: "Piedmont",
    country: "Italy",
    grapes: ["Nebbiolo"],
  };

  const reply = (
    text: string,
    chunks: { web: { uri: string; title: string } }[] = [],
  ) =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text }] },
            groundingMetadata: { groundingChunks: chunks },
          },
        ],
      }),
      { status: 200 },
    );

  it("searches and answers in one call, keeping the pages it used", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const client = new GeminiClient("key", async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return reply('{"found": true, "scores": []}', [
        { web: { uri: "https://a.example", title: "a" } },
        { web: { uri: "https://a.example", title: "a" } },
      ]);
    });
    const outcome = await client.lookup("gemini-flash-latest", subject);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(
      "/models/gemini-flash-latest:generateContent",
    );
    expect(calls[0].body.tools).toEqual([{ google_search: {} }]);
    expect(outcome.sources).toEqual([{ uri: "https://a.example", title: "a" }]);
    expect(outcome.response.found).toBe(true);
  });

  it("falls back to search then structure when the model refuses both at once", async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = new GeminiClient("key", async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if (bodies.length === 1)
        return new Response(
          JSON.stringify({ error: { message: "unsupported" } }),
          { status: 400 },
        );
      if (bodies.length === 2)
        return reply("Notes: 97 points from James Suckling", [
          { web: { uri: "https://b.example", title: "b" } },
        ]);
      return reply('{"found": true}');
    });
    const outcome = await client.lookup("m", subject);
    expect(bodies).toHaveLength(3);
    expect(bodies[1].tools).toBeDefined();
    expect(bodies[1].generationConfig).toBeUndefined();
    expect(bodies[2].tools).toBeUndefined();
    expect(outcome.sources).toEqual([{ uri: "https://b.example", title: "b" }]);
  });

  it("marks a bad key or used-up quota as fatal", async () => {
    const client = new GeminiClient(
      "bad",
      async () =>
        new Response(
          JSON.stringify({ error: { message: "API key not valid" } }),
          { status: 403 },
        ),
    );
    const err = await client.lookup("m", subject).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err.fatal).toBe(true);
    expect(err.message).toBe("API key not valid");
  });
});
