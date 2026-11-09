import type {
  EnrichResult,
  EnrichRun,
  EnrichSource,
  EnrichStatus,
  FillWindowsResult,
  VintageEnrichment,
  VintageProfile,
  VintageScore,
  WindowEstimate,
} from "@cellarboss/types";
import type { Selectable } from "kysely";
import type { EnrichRunTable } from "@schema/database.js";
import { db } from "@utils/database.js";
import { env } from "@utils/env.js";
import { logger } from "@utils/logger.js";
import { insertReturning, toBool } from "@utils/query-helpers.js";
import { GeminiClient, GeminiError } from "../enrich/gemini.js";
import type { LookupSubject } from "../enrich/prompt.js";
import {
  cleanScores,
  estimateWindow,
  lookupWindow,
} from "../enrich/normalise.js";

export const DEFAULT_MODEL = "gemini-flash-latest";

/** Thrown for requests that can't go ahead; the route returns its status. */
export class EnrichError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 502 | 503,
  ) {
    super(message);
  }
}

type LookupClient = Pick<GeminiClient, "lookup">;

let clientFactory: () => LookupClient | null = () =>
  env.GEMINI_API_KEY ? new GeminiClient(env.GEMINI_API_KEY) : null;

/** Swaps the Gemini client, for tests. */
export function setLookupClientFactory(factory: () => LookupClient | null) {
  clientFactory = factory;
}

function requireClient(): LookupClient {
  const client = clientFactory();
  if (!client)
    throw new EnrichError(
      "Wine lookup isn't set up: GEMINI_API_KEY is missing",
      503,
    );
  return client;
}

async function setting(key: string): Promise<string | undefined> {
  const row = await db
    .selectFrom("setting")
    .select("value")
    .where("key", "=", key)
    .executeTakeFirst();
  return row?.value;
}

async function currentModel(): Promise<string> {
  return (await setting("enrichModel"))?.trim() || DEFAULT_MODEL;
}

async function loadSubject(vintageId: number) {
  const row = await db
    .selectFrom("vintage")
    .innerJoin("wine", "wine.id", "vintage.wineId")
    .innerJoin("winemaker", "winemaker.id", "wine.wineMakerId")
    .leftJoin("region", "region.id", "wine.regionId")
    .leftJoin("country", "country.id", "region.countryId")
    .select([
      "vintage.id as vintageId",
      "vintage.year",
      "vintage.drinkFrom",
      "vintage.drinkUntil",
      "wine.id as wineId",
      "wine.name as wine",
      "wine.type",
      "winemaker.name as producer",
      "region.name as region",
      "country.name as country",
    ])
    .where("vintage.id", "=", vintageId)
    .executeTakeFirst();
  if (!row) return undefined;
  const grapes = await db
    .selectFrom("winegrape")
    .innerJoin("grape", "grape.id", "winegrape.grapeId")
    .select("grape.name")
    .where("winegrape.wineId", "=", row.wineId)
    .execute();
  const subject: LookupSubject = {
    producer: row.producer,
    wine: row.wine,
    year: row.year,
    type: row.type,
    region: row.region,
    country: row.country,
    grapes: grapes.map((g) => g.name),
  };
  return { row, subject };
}

/**
 * Looks one vintage up online and stores the result, replacing any earlier
 * lookup. Fills an empty drinking window when the enrichFillWindows setting
 * is on; never overwrites one. A fatal Gemini error (bad key, quota) is
 * thrown; any other failure is stored and returned as an "error" result.
 */
export async function enrichVintage(vintageId: number): Promise<EnrichResult> {
  const client = requireClient();
  const loaded = await loadSubject(vintageId);
  if (!loaded) throw new EnrichError("Not found", 404);
  const { row, subject } = loaded;
  const model = await currentModel();
  const fetchedAt = new Date().toISOString();

  let outcome;
  try {
    outcome = await client.lookup(model, subject);
  } catch (err) {
    if (err instanceof GeminiError && err.fatal) throw err;
    const message = err instanceof Error ? err.message : String(err);
    logger
      .withMetadata({ vintageId, model })
      .withError(err)
      .warn("Wine lookup failed");
    await saveProfile(vintageId, {
      status: "error",
      model,
      profile: null,
      sources: [],
      error: message,
      fetchedAt,
    });
    return {
      vintageId,
      status: "error",
      scores: 0,
      filledWindow: false,
      error: message,
    };
  }

  const { response, sources } = outcome;
  const status = response.found ? "ok" : "not_found";
  const scores = cleanScores(response, sources);
  await saveProfile(vintageId, {
    status,
    model,
    profile: response.found ? (response.profile ?? null) : null,
    sources,
    error: null,
    fetchedAt,
  });
  await db
    .deleteFrom("vintageScore")
    .where("vintageId", "=", vintageId)
    .execute();
  if (scores.length > 0)
    await db
      .insertInto("vintageScore")
      .values(scores.map((s) => ({ ...s, vintageId })))
      .execute();

  let filledWindow = false;
  const window = lookupWindow(response, row.year);
  if (
    window &&
    row.drinkFrom === null &&
    row.drinkUntil === null &&
    (await setting("enrichFillWindows")) !== "false"
  ) {
    await db
      .updateTable("vintage")
      .set(window)
      .where("id", "=", vintageId)
      .execute();
    filledWindow = true;
  }

  return {
    vintageId,
    status,
    scores: scores.length,
    filledWindow,
    error: null,
  };
}

async function saveProfile(
  vintageId: number,
  data: {
    status: VintageProfile["status"];
    model: string;
    profile: unknown;
    sources: EnrichSource[];
    error: string | null;
    fetchedAt: string;
  },
) {
  const values = {
    status: data.status,
    model: data.model,
    profile: data.profile === null ? null : JSON.stringify(data.profile),
    sources: JSON.stringify(data.sources),
    error: data.error,
    fetchedAt: data.fetchedAt,
  };
  const existing = await db
    .selectFrom("vintageProfile")
    .select("id")
    .where("vintageId", "=", vintageId)
    .executeTakeFirst();
  if (existing)
    await db
      .updateTable("vintageProfile")
      .set(values)
      .where("id", "=", existing.id)
      .execute();
  else
    await db
      .insertInto("vintageProfile")
      .values({ vintageId, ...values })
      .execute();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** The stored lookup, scores and window estimate for a vintage. */
export async function getEnrichment(
  vintageId: number,
): Promise<VintageEnrichment> {
  const [profileRow, scores, windowEstimate] = await Promise.all([
    db
      .selectFrom("vintageProfile")
      .selectAll()
      .where("vintageId", "=", vintageId)
      .executeTakeFirst(),
    db
      .selectFrom("vintageScore")
      .selectAll()
      .where("vintageId", "=", vintageId)
      .orderBy("points", "desc")
      .orderBy("id")
      .execute(),
    getWindowEstimate(vintageId),
  ]);
  const profile: VintageProfile | null = profileRow
    ? {
        ...profileRow,
        profile: parseJson(profileRow.profile, null),
        sources: parseJson<EnrichSource[]>(profileRow.sources, []),
      }
    : null;
  return { profile, scores: scores as VintageScore[], windowEstimate };
}

/** A window for this vintage averaged from the wine's other vintages. */
export async function getWindowEstimate(
  vintageId: number,
): Promise<WindowEstimate | null> {
  const vintage = await db
    .selectFrom("vintage")
    .select(["year", "wineId"])
    .where("id", "=", vintageId)
    .executeTakeFirst();
  if (!vintage || vintage.year === null) return null;
  const others = await db
    .selectFrom("vintage")
    .select(["year", "drinkFrom", "drinkUntil"])
    .where("wineId", "=", vintage.wineId)
    .where("id", "!=", vintageId)
    .execute();
  return estimateWindow(vintage.year, others);
}

/**
 * Fills every empty drinking window that the wine's other vintages give an
 * estimate for. Estimates come only from windows set before this call, so
 * one filled-in window doesn't feed the next.
 */
export async function fillWindows(): Promise<FillWindowsResult> {
  const vintages = await db
    .selectFrom("vintage")
    .select(["id", "wineId", "year", "drinkFrom", "drinkUntil"])
    .execute();
  const byWine = new Map<number, typeof vintages>();
  for (const v of vintages) {
    const list = byWine.get(v.wineId) ?? [];
    list.push(v);
    byWine.set(v.wineId, list);
  }
  const updates: { id: number; drinkFrom: number; drinkUntil: number }[] = [];
  for (const v of vintages) {
    if (v.drinkFrom !== null || v.drinkUntil !== null) continue;
    const estimate = estimateWindow(
      v.year,
      (byWine.get(v.wineId) ?? []).filter((o) => o.id !== v.id),
    );
    if (estimate)
      updates.push({
        id: v.id,
        drinkFrom: estimate.drinkFrom,
        drinkUntil: estimate.drinkUntil,
      });
  }
  for (const u of updates)
    await db
      .updateTable("vintage")
      .set({ drinkFrom: u.drinkFrom, drinkUntil: u.drinkUntil })
      .where("id", "=", u.id)
      .execute();
  return { filled: updates.length };
}

// ---- Runs: an admin looks up every vintage, one at a time ----

let active: { id: number; cancelled: boolean; done: Promise<void> } | null =
  null;

function toRun(row: Selectable<EnrichRunTable>): EnrichRun {
  return { ...row, onlyMissing: toBool(row.onlyMissing) };
}

async function latestRun(): Promise<EnrichRun | null> {
  const row = await db
    .selectFrom("enrichRun")
    .selectAll()
    .orderBy("id", "desc")
    .executeTakeFirst();
  if (!row) return null;
  // A run left "running" with nothing running it died with the server.
  if (row.status === "running" && active?.id !== row.id) {
    const finishedAt = new Date().toISOString();
    await db
      .updateTable("enrichRun")
      .set({ status: "interrupted", finishedAt })
      .where("id", "=", row.id)
      .execute();
    return toRun({ ...row, status: "interrupted", finishedAt });
  }
  return toRun(row);
}

export async function getStatus(): Promise<EnrichStatus> {
  return {
    configured: clientFactory() !== null,
    model: await currentModel(),
    run: await latestRun(),
  };
}

export async function startRun(
  userId: string,
  onlyMissing: boolean,
): Promise<EnrichRun> {
  requireClient();
  if (active) throw new EnrichError("A lookup run is already going", 409);

  let query = db
    .selectFrom("vintage")
    .select("vintage.id")
    .orderBy("vintage.id");
  if (onlyMissing)
    query = query
      .leftJoin("vintageProfile", "vintageProfile.vintageId", "vintage.id")
      .where("vintageProfile.id", "is", null);
  const ids = (await query.execute()).map((r) => r.id);

  const run = await insertReturning(db, "enrichRun", {
    status: "running",
    onlyMissing: onlyMissing ? 1 : 0,
    total: ids.length,
    done: 0,
    failed: 0,
    startedBy: userId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  });
  const state = { id: run.id, cancelled: false, done: Promise.resolve() };
  active = state;
  state.done = runLoop(state, ids).finally(() => {
    if (active === state) active = null;
  });
  return toRun(run);
}

async function runLoop(
  state: { id: number; cancelled: boolean },
  ids: number[],
) {
  let done = 0;
  let failed = 0;
  let status: EnrichRun["status"] = "done";
  let error: string | null = null;
  for (const [i, id] of ids.entries()) {
    if (state.cancelled) {
      status = "cancelled";
      break;
    }
    try {
      const result = await enrichVintage(id);
      if (result.status === "error") failed++;
    } catch (err) {
      if (err instanceof EnrichError && err.status === 404) {
        // Deleted since the run started.
      } else {
        status = "failed";
        error = err instanceof Error ? err.message : String(err);
        logger.withError(err).error("Wine lookup run stopped");
        break;
      }
    }
    done++;
    await db
      .updateTable("enrichRun")
      .set({ done, failed })
      .where("id", "=", state.id)
      .execute();
    if (i < ids.length - 1 && env.ENRICH_DELAY_MS > 0)
      await new Promise((r) => setTimeout(r, env.ENRICH_DELAY_MS));
  }
  await db
    .updateTable("enrichRun")
    .set({ status, error, done, failed, finishedAt: new Date().toISOString() })
    .where("id", "=", state.id)
    .execute();
}

/** Stops the run after the vintage it's on; the run then reads "cancelled". */
export async function cancelRun(): Promise<EnrichRun | null> {
  if (active) active.cancelled = true;
  return latestRun();
}

/** Resolves when the current run, if any, has finished. For tests. */
export async function waitForRun(): Promise<void> {
  await active?.done;
}
