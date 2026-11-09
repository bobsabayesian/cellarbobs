import type { EnrichSource, WindowEstimate } from "@cellarboss/types";
import type { LookupResponse } from "./schema.js";

/**
 * Reads a published score on a 100 point scale: "97/100" and "97+" are 97,
 * "18.5/20" is 93. Other scales (stars, /10) give null.
 */
export function scoreToPoints(score: string): number | null {
  const m = score.trim().match(/^(\d+(?:\.\d+)?)\s*\+?\s*(?:\/\s*(\d+))?/);
  if (!m) return null;
  const value = Number(m[1]);
  const scale = m[2] ? Number(m[2]) : value > 20 ? 100 : null;
  let points: number | null = null;
  if (scale === 100) points = value;
  else if (scale === 20) points = value * 5;
  if (points === null || points < 50 || points > 100) return null;
  return Math.round(points);
}

export interface CleanScore {
  critic: string;
  score: string;
  points: number | null;
  sourceUrl: string | null;
}

/**
 * Critic scores worth keeping. A lookup that searched nothing has no basis
 * for a score, so none are kept; otherwise one per critic, highest first.
 */
export function cleanScores(
  response: LookupResponse,
  sources: EnrichSource[],
): CleanScore[] {
  if (sources.length === 0 || !response.found) return [];
  const byCritic = new Map<string, CleanScore>();
  for (const s of response.scores ?? []) {
    const critic = s.critic.trim();
    const score = s.score.trim();
    if (!critic || !score) continue;
    const key = critic.toLowerCase();
    if (byCritic.has(key)) continue;
    byCritic.set(key, {
      critic,
      score,
      points: scoreToPoints(score),
      sourceUrl: httpUrl(s.sourceUrl),
    });
  }
  return [...byCritic.values()].sort(
    (a, b) => (b.points ?? 0) - (a.points ?? 0),
  );
}

function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

/** The drinking window from a lookup, if it's a sensible one. */
export function lookupWindow(
  response: LookupResponse,
  vintageYear: number | null,
): { drinkFrom: number; drinkUntil: number } | null {
  const from = response.profile?.serving?.drinkFrom;
  const until = response.profile?.serving?.drinkUntil;
  if (!response.found || typeof from !== "number" || typeof until !== "number")
    return null;
  if (from < MIN_YEAR || until > MAX_YEAR || from > until) return null;
  if (vintageYear !== null && from < vintageYear) return null;
  return { drinkFrom: from, drinkUntil: until };
}

export interface WindowSample {
  year: number | null;
  drinkFrom: number | null;
  drinkUntil: number | null;
}

/**
 * Estimates a vintage's drinking window from the wine's other vintages:
 * on average they open N years after harvest and close M years after, so
 * this one is year + N to year + M. Needs a year and at least one other
 * vintage with a full window.
 */
export function estimateWindow(
  year: number | null,
  others: WindowSample[],
): WindowEstimate | null {
  if (year === null) return null;
  const samples = others.filter(
    (o): o is { year: number; drinkFrom: number; drinkUntil: number } =>
      o.year !== null &&
      o.year !== year &&
      o.drinkFrom !== null &&
      o.drinkUntil !== null &&
      o.drinkFrom <= o.drinkUntil,
  );
  if (samples.length === 0) return null;
  const avg = (values: number[]) =>
    values.reduce((sum, v) => sum + v, 0) / values.length;
  const opens = Math.round(avg(samples.map((s) => s.drinkFrom - s.year)));
  const closes = Math.round(avg(samples.map((s) => s.drinkUntil - s.year)));
  return {
    drinkFrom: year + opens,
    drinkUntil: year + Math.max(opens, closes),
    basedOn: samples.length,
  };
}
