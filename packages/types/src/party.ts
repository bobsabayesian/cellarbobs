import type { Bottle } from "./bottle";
import type { ImportCommit } from "./import";

export type PartyStatus = "active" | "finished" | "cancelled";

/** How guests taste: a format file in the backend's PARTY_FORMATS_DIR. */
export type PartyFormatId = "beginner" | "advanced";

export interface TastingFormatField {
  /** Stable answer key, e.g. "tannin". */
  key: string;
  label: string;
  /** scale: pick one, low to high. multi: pick several. colour: family then shade. */
  kind: "scale" | "multi" | "colour";
  options?: string[];
  /** For colour: family name to its shades, youngest to oldest. */
  families?: Record<string, { label: string; color: string }[]>;
  note?: string;
  /** Columns for a scale's buttons (default: one per option). */
  cols?: number;
  /** Picks count as aroma tags (palate profile, PDFs). */
  tag?: boolean;
  /** A scale that also sets this 1-5 structure attribute. */
  structure?: "acidity" | "tannin" | "body" | "oak";
}

export interface TastingFormat {
  id: PartyFormatId;
  name: string;
  description?: string;
  /** score: the party's 100-point or 5-star scale. reaction: labelled choices. */
  rating:
    | { kind: "score" }
    | { kind: "reaction"; options: { label: string; score: number }[] };
  steps: {
    id: string;
    title: string;
    hint?: string;
    blocks: {
      id: string;
      title: string;
      subtitle?: string;
      collapsible?: boolean;
      open?: boolean;
      fields: TastingFormatField[];
    }[];
  }[];
}

/** Answers keyed by field; colour answers read "Red: garnet". */
export type PartyAnswers = Record<string, string | string[]>;
export type PartyScoreScale = 100 | 5;

/** all: every bottle visible from the start. sequential: poured one at a time. */
export type PartyPacing = "all" | "sequential";

export type PartyStructure = Partial<
  Record<"acidity" | "tannin" | "body" | "oak", number>
>;

export interface PartyGuesses {
  grape?: string;
  region?: string;
  country?: string;
  vintage?: number;
}

export interface TastingParty {
  id: number;
  title: string;
  date: string; // ISO date
  status: PartyStatus;
  token: string;
  scoreScale: PartyScoreScale;
  /** Null for parties from before formats (tags plus 1-5 structure). */
  format: PartyFormatId | null;
  pacing: PartyPacing;
  hostUserId: string;
  createdAt: string;
  finishedAt: string | null;
}

/** The true identity of a party bottle, shown to the host and after reveal. */
export interface PartyWine {
  /** The cellar bottle poured, or null for a bottle a guest brought. */
  bottleId: number | null;
  vintageId: number;
  wineId: number;
  wineName: string;
  winemaker: string;
  year: number | null;
  type: string;
  region: string | null;
  country: string | null;
  grapes: string[];
  size: Bottle["size"];
}

export interface PartyBottle {
  id: number;
  partyId: number;
  /** Null when a guest brought it rather than it coming from the cellar. */
  bottleId: number | null;
  vintageId: number;
  label: string;
  position: number;
  /** When the host poured it; guests only see poured bottles. */
  pouredAt: string | null;
  revealedAt: string | null;
  broughtBy: string | null;
  wantToBuy: boolean;
  /** A mystery bottle the host hasn't filled in yet: its wine is a placeholder. */
  needsDetails: boolean;
}

/**
 * A bottle a guest brings: a wine in the wine list and its vintage year, a
 * new wine (an import commit) created along with the party, or a mystery
 * bottle the host doesn't know yet and fills in afterwards.
 */
export type GuestBottleInput =
  | { wineId: number; year: number | null; broughtBy?: string }
  | { newWine: ImportCommit; broughtBy?: string }
  | { mystery: true; broughtBy?: string };

/** What a mystery bottle turned out to be: the same choices as a guest bottle. */
export type BottleDetailsInput =
  { wineId: number; year: number | null } | { newWine: ImportCommit };

export interface PartyGuest {
  id: number;
  partyId: number;
  name: string;
  isHost: boolean;
}

export interface PartyReview {
  id: number;
  partyBottleId: number;
  guestId: number;
  score: number | null; // 0-100
  tags: string[];
  structure: PartyStructure;
  notes: string;
  guesses: PartyGuesses;
  /** Format answers; empty for reviews from before formats. */
  answers: PartyAnswers;
  updatedAt: string;
}

/** Host view: everything, including the wine behind each label. */
export interface PartyDetail extends TastingParty {
  /** The party's format definition (null for pre-format parties). */
  formatDef: TastingFormat | null;
  bottles: (PartyBottle & { wine: PartyWine })[];
  guests: PartyGuest[];
  reviews: PartyReview[];
}

export interface PartySummary extends TastingParty {
  /** Mystery bottles still waiting for their details. */
  needsDetailsCount: number;
  bottleCount: number;
  guestCount: number;
  reviewCount: number;
}

export interface CreateParty {
  title: string;
  date: string;
  scoreScale: PartyScoreScale;
  format: PartyFormatId;
  pacing?: PartyPacing;
  bottleIds: number[];
  guestBottles?: GuestBottleInput[];
}

/** A guest bottle the host flagged to buy, with how it scored blind. */
export interface WantToBuyWine {
  partyId: number;
  partyTitle: string;
  partyDate: string;
  label: string;
  broughtBy: string | null;
  wine: PartyWine;
  hostScore: number | null;
  averageScore: number | null;
  scoreCount: number;
}

/** Guest view: unrevealed bottles carry only their label. */
export interface PublicParty {
  title: string;
  date: string;
  status: PartyStatus;
  scoreScale: PartyScoreScale;
  /** The quick-tap tags to offer, grouped (pre-format parties only). */
  tagGroups: Record<string, string[]>;
  /** What guests are asked; null for pre-format parties. */
  format: TastingFormat | null;
  bottles: {
    label: string;
    revealed: boolean;
    wine: PartyWine | null;
    /** Who brought it, once revealed (null for the host's own bottles). */
    broughtBy: string | null;
    /** Everyone's scores, once revealed. */
    scores: { guest: string; score: number | null }[] | null;
  }[];
}

/** A guest's own reviews; partyId is only set for the host. */
export interface MyPartyReviews {
  name: string;
  isHost: boolean;
  partyId: number | null;
  reviews: (PartyReview & { label: string })[];
}

/** A party a bottle was poured at, for the bottle page. */
export interface BottleParty {
  id: number;
  title: string;
  date: string;
  status: PartyStatus;
  label: string;
  broughtBy: string | null;
}

export interface PartyJoinResult {
  guestId: number;
  name: string;
  secret: string;
}

export interface UpsertPartyReview {
  score?: number | null;
  tags?: string[];
  structure?: PartyStructure;
  notes?: string;
  guesses?: PartyGuesses;
  answers?: PartyAnswers;
}

export interface PalateGroup {
  key: string;
  count: number;
  mean: number;
  delta: number;
}

export interface PalateProfile {
  reviewCount: number;
  overallMean: number | null;
  byType: PalateGroup[];
  byCountry: PalateGroup[];
  byRegion: PalateGroup[];
  byGrape: PalateGroup[];
  byAge: PalateGroup[];
  byStructure: PalateGroup[];
  byTag: PalateGroup[];
  /** Tasting format answers, e.g. "Tannin feels: grippy". */
  byAttribute: PalateGroup[];
}

export interface TasterCalibration {
  taster: string;
  sharedBottles: number;
  correlation: number | null;
  meanOffset: number;
  meanAbsoluteError: number;
  suggestedWeight: number;
}

export interface GuessAccuracy {
  field: "grape" | "region" | "country" | "vintage";
  attempts: number;
  correct: number;
  rate: number;
}
