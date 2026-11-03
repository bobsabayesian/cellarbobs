import { describe, it, expect } from "vitest";
import {
  ageBucket,
  guessAccuracy,
  guessMatches,
  palateProfile,
  pearson,
  tasterCalibration,
  type StatRow,
} from "../stats.js";

function row(
  overrides: Omit<Partial<StatRow>, "wine"> & {
    wine?: Partial<StatRow["wine"]>;
  },
): StatRow {
  const { wine, ...rest } = overrides;
  return {
    partyId: 1,
    partyDate: "2026-11-07",
    label: "A",
    guestKey: "host",
    guest: "Host",
    isHost: true,
    score: 90,
    tags: [],
    structure: {},
    guesses: {},
    ...rest,
    wine: {
      bottleId: 1,
      year: 2016,
      type: "red",
      region: "Piedmont",
      country: "Italy",
      grapes: ["Nebbiolo"],
      ...wine,
    },
  };
}

describe("pearson", () => {
  it("is 1 for perfectly aligned scores and null without variance", () => {
    expect(pearson([80, 85, 90], [82, 87, 92])).toBeCloseTo(1);
    expect(pearson([80, 85, 90], [90, 85, 80])).toBeCloseTo(-1);
    expect(pearson([90, 90, 90], [80, 85, 90])).toBeNull();
  });
});

describe("ageBucket", () => {
  it("buckets by years in bottle", () => {
    expect(ageBucket(null)).toBe("non-vintage");
    expect(ageBucket(2)).toBe("0-2 years");
    expect(ageBucket(7)).toBe("6-9 years");
    expect(ageBucket(20)).toBe("15+ years");
  });
});

describe("palateProfile", () => {
  const rows = [
    row({
      label: "A",
      score: 95,
      structure: { tannin: 5 },
      wine: { year: 2016 },
    }),
    row({
      label: "B",
      score: 85,
      structure: { tannin: 5 },
      wine: { year: 2022 },
    }),
    row({
      label: "C",
      score: 78,
      structure: { tannin: 2 },
      wine: {
        grapes: ["Merlot"],
        region: "Bordeaux",
        country: "France",
        year: 2020,
      },
    }),
    row({
      label: "A",
      isHost: false,
      guestKey: "ana",
      guest: "Ana",
      score: 50,
    }),
  ];

  it("uses only the host's scores and reports deltas from their mean", () => {
    const profile = palateProfile(rows);
    expect(profile.reviewCount).toBe(3);
    expect(profile.overallMean).toBeCloseTo(86, 0);
    const nebbiolo = profile.byGrape.find((g) => g.key === "Nebbiolo")!;
    expect(nebbiolo).toMatchObject({ count: 2, mean: 90 });
    expect(nebbiolo.delta).toBeGreaterThan(0);
    expect(profile.byStructure[0].key).toBe("tannin: high");
  });

  it("filters by grape and age", () => {
    const older = palateProfile(rows, { grape: "nebbiolo", minAge: 6 });
    expect(older.reviewCount).toBe(1);
    expect(older.overallMean).toBe(95);
  });
});

describe("tasterCalibration", () => {
  it("compares guests with the host on shared bottles", () => {
    const labels = ["A", "B", "C"];
    const host = [95, 85, 78];
    const ana = [92, 84, 70];
    const rows = labels.flatMap((label, i) => [
      row({ label, score: host[i] }),
      row({
        label,
        score: ana[i],
        isHost: false,
        guestKey: "ana",
        guest: "Ana",
      }),
      row({ label, score: 80, isHost: false, guestKey: "flat", guest: "Flat" }),
    ]);
    const [first, second] = tasterCalibration(rows);
    expect(first).toMatchObject({ taster: "Ana", sharedBottles: 3 });
    expect(first.correlation!).toBeGreaterThan(0.9);
    expect(first.meanOffset).toBeCloseTo(-4, 0);
    expect(second).toMatchObject({
      taster: "Flat",
      correlation: null,
      suggestedWeight: 0,
    });
  });

  it("needs three shared bottles", () => {
    const rows = [
      row({ label: "A", score: 90 }),
      row({
        label: "A",
        score: 88,
        isHost: false,
        guestKey: "bo",
        guest: "Bo",
      }),
    ];
    expect(tasterCalibration(rows)).toEqual([]);
  });
});

describe("guesses", () => {
  it("matches accent- and case-blind, and vintages within a year", () => {
    expect(guessMatches("piemonte", "Piedmont")).toBe(false);
    expect(guessMatches("piedmont", "Piedmont")).toBe(true);
    expect(guessMatches("Rhone", "Rhône Valley")).toBe(true);
    const accuracy = guessAccuracy([
      row({ guesses: { grape: "nebbiolo", vintage: 2017, country: "France" } }),
    ]);
    expect(accuracy).toEqual([
      { field: "grape", attempts: 1, correct: 1, rate: 1 },
      { field: "region", attempts: 0, correct: 0, rate: 0 },
      { field: "country", attempts: 1, correct: 0, rate: 0 },
      { field: "vintage", attempts: 1, correct: 1, rate: 1 },
    ]);
  });
});
