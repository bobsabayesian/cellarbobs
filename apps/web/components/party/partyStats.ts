import type { PartyDetail } from "@cellarboss/types";

export type BottleStats = {
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
};

/** Score summary for one party bottle across every taster. */
export function bottleStats(
  party: PartyDetail,
  partyBottleId: number,
): BottleStats {
  const scores = party.reviews
    .filter((r) => r.partyBottleId === partyBottleId && r.score !== null)
    .map((r) => r.score as number);
  if (scores.length === 0)
    return { count: 0, mean: null, min: null, max: null };
  return {
    count: scores.length,
    mean:
      Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    min: Math.min(...scores),
    max: Math.max(...scores),
  };
}
