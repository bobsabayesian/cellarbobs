export const BOTTLE_STATUSES = [
  "ordered",
  "stored",
  "in-primeur",
  // Out of its bin for a blind tasting party; becomes "drunk" when it ends.
  "in-tasting",
  "drunk",
  "sold",
  "gifted",
] as const;
export type BottleStatus = (typeof BOTTLE_STATUSES)[number];

export const BOTTLE_SIZES = [
  "piccolo",
  "half",
  "standard",
  "litre",
  "magnum",
  "double-magnum",
  "jeroboam",
  "imperial",
  "salmanazar",
  "balthazar",
  "nebuchadnezzar",
] as const;
export type BottleSize = (typeof BOTTLE_SIZES)[number];

export const WINE_TYPES = [
  "red",
  "white",
  "rose",
  "orange",
  "sparkling",
  "fortified",
  "dessert",
] as const;
export type WineType = (typeof WINE_TYPES)[number];

export const PARTY_STATUSES = ["active", "finished", "cancelled"] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

/** Scale guests rate on. Scores are always stored out of 100. */
export const PARTY_SCORE_SCALES = [100, 5] as const;
export type PartyScoreScale = (typeof PARTY_SCORE_SCALES)[number];

export const PARTY_FORMATS = ["beginner", "advanced"] as const;
export type PartyFormat = (typeof PARTY_FORMATS)[number];

export const PARTY_MIN_BOTTLES = 2;
export const PARTY_MAX_BOTTLES = 12;

/** Structure attributes rated 1 (low) to 5 (high). */
export const STRUCTURE_KEYS = ["acidity", "tannin", "body", "oak"] as const;
export type StructureKey = (typeof STRUCTURE_KEYS)[number];

/** Quick-tap tasting tags, grouped for display. */
export const TASTING_TAG_GROUPS = {
  fruit: [
    "cherry",
    "red berry",
    "black fruit",
    "plum",
    "citrus",
    "green apple",
    "stone fruit",
    "tropical",
    "dried fruit",
  ],
  floral: ["rose", "violet", "white flowers"],
  earth: ["earth", "mushroom", "forest floor", "mineral", "tar", "leather"],
  oak: ["vanilla", "toast", "smoke", "cedar", "coconut"],
  spice: ["pepper", "baking spice", "herbal", "licorice", "tobacco"],
  other: ["honey", "nutty", "brioche", "funky"],
} as const;
export const TASTING_TAGS = Object.values(TASTING_TAG_GROUPS).flat();
export type TastingTag = (typeof TASTING_TAGS)[number];

/** Statuses of bottles that have left the cellar for good. */
export const CONSUMED_BOTTLE_STATUSES = ["drunk", "sold", "gifted"] as const;

export function isConsumedStatus(status: string): boolean {
  return (CONSUMED_BOTTLE_STATUSES as readonly string[]).includes(status);
}
