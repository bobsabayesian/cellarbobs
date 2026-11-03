import type {
  GuessAccuracy,
  PalateGroup,
  PalateProfile,
  PartyStructure,
  TasterCalibration,
} from "@cellarboss/types";
import { foldKey } from "../import/normalise/text.js";

/**
 * Palate statistics over blind party reviews. Pure: the controller loads the
 * rows (controllers/parties.controller.ts reviewRows) and these crunch them.
 */

export interface StatRow {
  partyId: number;
  partyDate: string;
  label: string;
  guestKey: string;
  guest: string;
  isHost: boolean;
  score: number | null;
  tags: string[];
  structure: PartyStructure;
  /** "Finish length: long"-style answers from a tasting format. */
  attributes?: string[];
  guesses: {
    grape?: string;
    region?: string;
    country?: string;
    vintage?: number;
  };
  wine: {
    bottleId: number | null;
    year: number | null;
    type: string;
    region: string | null;
    country: string | null;
    grapes: string[];
  };
}

const STRUCTURE_LEVELS = [
  "",
  "low",
  "medium-low",
  "medium",
  "medium-high",
  "high",
];

export function ageAtTasting(row: Pick<StatRow, "partyDate" | "wine">) {
  if (row.wine.year === null) return null;
  return Number(row.partyDate.slice(0, 4)) - row.wine.year;
}

export function ageBucket(age: number | null): string {
  if (age === null) return "non-vintage";
  if (age < 3) return "0-2 years";
  if (age < 6) return "3-5 years";
  if (age < 10) return "6-9 years";
  if (age < 15) return "10-14 years";
  return "15+ years";
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Pearson correlation, or null when either side has no variance. */
export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function groupBy(
  rows: { score: number }[],
  keysOf: (row: never) => string[],
  overall: number,
): PalateGroup[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    for (const key of keysOf(row as never)) {
      const list = groups.get(key) ?? [];
      list.push(row.score);
      groups.set(key, list);
    }
  }
  return [...groups]
    .map(([key, scores]) => {
      const m = mean(scores);
      return {
        key,
        count: scores.length,
        mean: round(m, 1),
        delta: round(m - overall, 1),
      };
    })
    .sort((a, b) => b.delta - a.delta || b.count - a.count);
}

export interface ProfileFilter {
  grape?: string;
  region?: string;
  country?: string;
  type?: string;
  minAge?: number;
  maxAge?: number;
}

function matchesFilter(row: StatRow, filter: ProfileFilter): boolean {
  const eq = (a: string | null | undefined, b: string) =>
    !!a && foldKey(a) === foldKey(b);
  if (filter.grape && !row.wine.grapes.some((g) => eq(g, filter.grape!)))
    return false;
  if (filter.region && !eq(row.wine.region, filter.region)) return false;
  if (filter.country && !eq(row.wine.country, filter.country)) return false;
  if (filter.type && !eq(row.wine.type, filter.type)) return false;
  const age = ageAtTasting(row);
  if (filter.minAge !== undefined && (age === null || age < filter.minAge))
    return false;
  if (filter.maxAge !== undefined && (age === null || age > filter.maxAge))
    return false;
  return true;
}

/**
 * The host's blind scores grouped by wine attribute, each with its mean and
 * its difference from the host's overall mean (positive = likes it more).
 */
export function palateProfile(
  rows: StatRow[],
  filter: ProfileFilter = {},
): PalateProfile {
  const scored = rows
    .filter((r) => r.isHost && r.score !== null && matchesFilter(r, filter))
    .map((r) => ({ ...r, score: r.score as number }));
  type Scored = (typeof scored)[number];
  const overall = scored.length ? mean(scored.map((r) => r.score)) : 0;
  const by = (keysOf: (r: Scored) => string[]) =>
    groupBy(scored, keysOf as (row: never) => string[], overall);

  return {
    reviewCount: scored.length,
    overallMean: scored.length ? round(overall, 1) : null,
    byType: by((r) => [r.wine.type]),
    byCountry: by((r) => (r.wine.country ? [r.wine.country] : [])),
    byRegion: by((r) => (r.wine.region ? [r.wine.region] : [])),
    byGrape: by((r) => r.wine.grapes),
    byAge: by((r) => [ageBucket(ageAtTasting(r))]),
    byStructure: by((r) =>
      Object.entries(r.structure)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${STRUCTURE_LEVELS[v as number]}`),
    ),
    byTag: by((r) => r.tags),
    byAttribute: by((r) => r.attributes ?? []),
  };
}

/**
 * How each other taster's scores line up with the host's on the same bottles.
 * A taster needs at least `minShared` bottles in common to be calibrated.
 */
export function tasterCalibration(
  rows: StatRow[],
  minShared = 3,
): TasterCalibration[] {
  const bottleKey = (r: StatRow) => `${r.partyId}|${r.label}`;
  const host = new Map<string, number>();
  for (const r of rows)
    if (r.isHost && r.score !== null) host.set(bottleKey(r), r.score);

  const byTaster = new Map<
    string,
    { name: string; pairs: [number, number][] }
  >();
  for (const r of rows) {
    if (r.isHost || r.score === null) continue;
    const hostScore = host.get(bottleKey(r));
    if (hostScore === undefined) continue;
    const entry = byTaster.get(r.guestKey) ?? { name: r.guest, pairs: [] };
    entry.pairs.push([hostScore, r.score]);
    byTaster.set(r.guestKey, entry);
  }

  return [...byTaster.values()]
    .filter((t) => t.pairs.length >= minShared)
    .map(({ name, pairs }) => {
      const r = pearson(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1]),
      );
      return {
        taster: name,
        sharedBottles: pairs.length,
        correlation: r === null ? null : round(r),
        meanOffset: round(mean(pairs.map(([h, g]) => g - h)), 1),
        meanAbsoluteError: round(
          mean(pairs.map(([h, g]) => Math.abs(g - h))),
          1,
        ),
        suggestedWeight: r === null ? 0 : round(Math.max(0, r)),
      };
    })
    .sort((a, b) => (b.correlation ?? -2) - (a.correlation ?? -2));
}

/** Whether a free-text guess names the actual value (accent and case blind). */
export function guessMatches(guess: string, actual: string | null): boolean {
  if (!actual) return false;
  const g = foldKey(guess);
  const a = foldKey(actual);
  return !!g && (g === a || a.includes(g) || g.includes(a));
}

/** Hit rate for each guess field, for one taster (by name key) or everyone. */
export function guessAccuracy(
  rows: StatRow[],
  tasterKey?: string,
): GuessAccuracy[] {
  const pool = rows.filter((r) => !tasterKey || r.guestKey === tasterKey);
  const fields = ["grape", "region", "country", "vintage"] as const;
  return fields.map((field) => {
    let attempts = 0;
    let correct = 0;
    for (const r of pool) {
      const guess = r.guesses[field];
      if (guess === undefined || guess === "") continue;
      attempts++;
      const hit =
        field === "vintage"
          ? r.wine.year !== null && Math.abs(Number(guess) - r.wine.year) <= 1
          : field === "grape"
            ? r.wine.grapes.some((g) => guessMatches(String(guess), g))
            : guessMatches(String(guess), r.wine[field]);
      if (hit) correct++;
    }
    return {
      field,
      attempts,
      correct,
      rate: attempts ? round(correct / attempts) : 0,
    };
  });
}
