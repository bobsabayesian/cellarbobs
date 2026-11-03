import { z } from "zod";
import { importCommitSchema } from "./import.validator";
import {
  PARTY_FORMATS,
  PARTY_MAX_BOTTLES,
  PARTY_MIN_BOTTLES,
  STRUCTURE_KEYS,
} from "./constants";

const broughtBySchema = z
  .string()
  .trim()
  .max(40)
  .optional()
  .describe("Who brought the bottle");

/** A guest's bottle of a wine already in the wine list. */
export const existingGuestBottleSchema = z.object({
  wineId: z.number().int().positive().describe("Wine from the wine list"),
  year: z
    .number()
    .int()
    .min(1800)
    .max(2100)
    .nullable()
    .describe("Vintage year, or null for non-vintage"),
  broughtBy: broughtBySchema,
});

/**
 * A guest's bottle: either a wine already in the wine list, or a new wine
 * (an import commit, typed in or read from a link) created with the party.
 */
export const guestBottleSchema = z.union([
  existingGuestBottleSchema,
  z.object({
    newWine: importCommitSchema.describe("Wine to create, as an import commit"),
    broughtBy: broughtBySchema,
  }),
]);

export const wantToBuySchema = z.object({ wantToBuy: z.boolean() });

export const createPartySchema = z
  .object({
    title: z.string().trim().min(1).max(120).describe("Name of the tasting"),
    date: z.iso.date().describe("Date of the tasting (ISO date)"),
    scoreScale: z
      .union([z.literal(100), z.literal(5)])
      .describe("Scale guests rate on: 100 points or 5 stars"),
    pacing: z
      .enum(["all", "sequential"])
      .default("all")
      .describe(
        "all: every bottle visible at once. sequential: poured one at a time",
      ),
    format: z
      .enum(PARTY_FORMATS)
      .default("beginner")
      .describe("Tasting format: beginner or advanced"),
    bottleIds: z
      .array(z.number().int().positive())
      .max(PARTY_MAX_BOTTLES)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate bottles")
      .describe("Cellar bottles to pour, all currently stored"),
    guestBottles: z
      .array(guestBottleSchema)
      .max(PARTY_MAX_BOTTLES)
      .optional()
      .describe("Bottles guests are bringing"),
  })
  .refine(
    (party) => {
      const total = party.bottleIds.length + (party.guestBottles?.length ?? 0);
      return total >= PARTY_MIN_BOTTLES && total <= PARTY_MAX_BOTTLES;
    },
    {
      message: `A party needs ${PARTY_MIN_BOTTLES}-${PARTY_MAX_BOTTLES} bottles in total`,
      path: ["bottleIds"],
    },
  );

export const joinPartySchema = z.object({
  name: z.string().trim().min(1).max(40).describe("Guest display name"),
});

const structureLevel = z.number().int().min(1).max(5);

export const partyStructureSchema = z
  .object(
    Object.fromEntries(
      STRUCTURE_KEYS.map((key) => [key, structureLevel.optional()]),
    ) as Record<
      (typeof STRUCTURE_KEYS)[number],
      z.ZodOptional<typeof structureLevel>
    >,
  )
  .strict();

export const partyGuessesSchema = z
  .object({
    grape: z.string().trim().max(80).optional(),
    region: z.string().trim().max(80).optional(),
    country: z.string().trim().max(80).optional(),
    vintage: z.number().int().min(1800).max(2100).optional(),
  })
  .strict();

export const upsertPartyReviewSchema = z
  .object({
    score: z.number().int().min(0).max(100).nullable().optional(),
    // Checked against the host's tags file on the server (party/tags.ts).
    tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    structure: partyStructureSchema.optional(),
    notes: z.string().max(4000).optional(),
    guesses: partyGuessesSchema.optional(),
    // Checked against the party's format on the server (party/formats.ts).
    answers: z
      .record(
        z.string().max(40),
        z.union([z.string().max(120), z.array(z.string().max(60)).max(40)]),
      )
      .optional(),
  })
  .strict();

/** Converts a guest's rating on the party's scale to the stored 0-100 score. */
export function toStoredScore(value: number, scale: 100 | 5): number {
  return scale === 5 ? Math.round(value * 20) : Math.round(value);
}

/** Converts a stored 0-100 score back to the party's scale. */
export function fromStoredScore(score: number, scale: 100 | 5): number {
  return scale === 5 ? Math.round(score / 20) : score;
}
