import { describe, it, expect } from "vitest";
import {
  createPartySchema,
  fromStoredScore,
  toStoredScore,
  upsertPartyReviewSchema,
} from "../party.validator";

describe("party score scales", () => {
  it("stores stars as 0-100 and converts back", () => {
    expect(toStoredScore(4, 5)).toBe(80);
    expect(fromStoredScore(80, 5)).toBe(4);
    expect(fromStoredScore(92, 5)).toBe(5);
    expect(toStoredScore(91, 100)).toBe(91);
    expect(fromStoredScore(91, 100)).toBe(91);
  });
});

describe("createPartySchema", () => {
  const valid = {
    title: "Fall Nebbiolo",
    date: "2026-11-07",
    scoreScale: 100,
    bottleIds: [1, 2],
  };

  it("accepts 2-8 distinct bottles on a known scale", () => {
    expect(createPartySchema.safeParse(valid).success).toBe(true);
    expect(
      createPartySchema.safeParse({ ...valid, bottleIds: [1] }).success,
    ).toBe(false);
    expect(
      createPartySchema.safeParse({
        ...valid,
        bottleIds: Array.from({ length: 13 }, (_, i) => i + 1),
      }).success,
    ).toBe(false);
    expect(
      createPartySchema.safeParse({ ...valid, bottleIds: [1, 1] }).success,
    ).toBe(false);
    expect(
      createPartySchema.safeParse({ ...valid, scoreScale: 10 }).success,
    ).toBe(false);
  });
});

describe("guest bottles", () => {
  const base = { title: "BYOB", date: "2026-11-07", scoreScale: 5 };

  it("counts guest bottles toward the 2-12 total", () => {
    expect(
      createPartySchema.safeParse({
        ...base,
        bottleIds: [],
        guestBottles: [
          { wineId: 1, year: 2019, broughtBy: "Dave" },
          { wineId: 2, year: null },
        ],
      }).success,
    ).toBe(true);
    expect(
      createPartySchema.safeParse({
        ...base,
        bottleIds: [1],
        guestBottles: [],
      }).success,
    ).toBe(false);
    expect(
      createPartySchema.safeParse({
        ...base,
        bottleIds: Array.from({ length: 10 }, (_, i) => i + 1),
        guestBottles: [
          { wineId: 1, year: 2019 },
          { wineId: 1, year: 2020 },
          { wineId: 1, year: 2021 },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("upsertPartyReviewSchema", () => {
  it("bounds tags and accepts 1-5 structure only", () => {
    expect(
      upsertPartyReviewSchema.safeParse({
        score: 90,
        tags: ["cherry", "tar"],
        structure: { tannin: 5, acidity: 1 },
        guesses: { grape: "Nebbiolo", vintage: 2016 },
      }).success,
    ).toBe(true);
    // Which tags exist is the host's tags file, checked on the server; the
    // schema only bounds their size.
    expect(
      upsertPartyReviewSchema.safeParse({ tags: ["glitter"] }).success,
    ).toBe(true);
    expect(
      upsertPartyReviewSchema.safeParse({ tags: ["x".repeat(41)] }).success,
    ).toBe(false);
    expect(
      upsertPartyReviewSchema.safeParse({ structure: { tannin: 6 } }).success,
    ).toBe(false);
    expect(
      upsertPartyReviewSchema.safeParse({ structure: { sweetness: 2 } })
        .success,
    ).toBe(false);
    expect(upsertPartyReviewSchema.safeParse({ score: 101 }).success).toBe(
      false,
    );
  });
});
