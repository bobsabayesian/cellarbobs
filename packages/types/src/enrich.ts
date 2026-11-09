/**
 * Wine data looked up online (a Gemini model with Google Search) for one
 * vintage. Every section is optional: the model leaves out what it can't
 * find rather than guessing.
 */
export interface WineProfileData {
  wine?: {
    name?: string | null;
    producer?: string | null;
    vintage?: number | null;
    type?: string | null;
    style?: string | null;
    classification?: string | null;
  } | null;
  origin?: {
    country?: string | null;
    region?: string | null;
    subregion?: string | null;
    appellation?: string | null;
    commune?: string | null;
    vineyards?: string[] | null;
  } | null;
  composition?: {
    grapes?: { variety: string; percentage?: number | null }[] | null;
    alcohol?: string | null;
    bottleFormat?: string | null;
    allergens?: string[] | null;
  } | null;
  winemaking?: {
    vineDensity?: string | null;
    yield?: string | null;
    harvest?: string | null;
    fermentation?: string | null;
    oakAging?: string | null;
    otherAging?: string | null;
    filtration?: string | null;
    sulfites?: string | null;
  } | null;
  tasting?: {
    appearance?: string | null;
    aromas?: string[] | null;
    body?: string | null;
    tannins?: string | null;
    acidity?: string | null;
    finish?: string | null;
  } | null;
  serving?: {
    drinkFrom?: number | null;
    drinkUntil?: number | null;
    temperature?: string | null;
    decanting?: string | null;
    foodPairings?: string[] | null;
  } | null;
  market?: {
    averagePriceUsd?: number | null;
    barcodes?: string[] | null;
  } | null;
  /** Short summaries of published reviews, never the review's own text. */
  reviews?: { source: string; summary: string; url?: string | null }[] | null;
  /** The model's own confidence that this is the right wine and vintage. */
  confidence?: "high" | "medium" | "low" | null;
}

export interface EnrichSource {
  title: string | null;
  uri: string;
}

export interface VintageScore {
  id: number;
  vintageId: number;
  critic: string;
  /** As published, e.g. "97/100" or "18.5/20". */
  score: string;
  /** On a 100 point scale when the score could be read as one. */
  points: number | null;
  sourceUrl: string | null;
}

export type VintageProfileStatus = "ok" | "not_found" | "error";

export interface VintageProfile {
  id: number;
  vintageId: number;
  status: VintageProfileStatus;
  model: string;
  profile: WineProfileData | null;
  sources: EnrichSource[];
  error: string | null;
  fetchedAt: string;
}

/** What the vintage page shows: the lookup, if any, and its scores. */
export interface VintageEnrichment {
  profile: VintageProfile | null;
  scores: VintageScore[];
  /** A drinking window worked out from this wine's other vintages. */
  windowEstimate: WindowEstimate | null;
}

export interface WindowEstimate {
  drinkFrom: number;
  drinkUntil: number;
  /** How many other vintages it's averaged from. */
  basedOn: number;
}

/** The result of looking up one vintage. */
export interface EnrichResult {
  vintageId: number;
  status: VintageProfileStatus;
  scores: number;
  /** Whether an empty drinking window was filled in. */
  filledWindow: boolean;
  error: string | null;
}

export type EnrichRunStatus =
  "running" | "done" | "cancelled" | "failed" | "interrupted";

export interface EnrichRun {
  id: number;
  status: EnrichRunStatus;
  /** Only vintages that have never been looked up. */
  onlyMissing: boolean;
  total: number;
  done: number;
  failed: number;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface EnrichStatus {
  /** Whether the server has a Gemini API key. */
  configured: boolean;
  model: string;
  run: EnrichRun | null;
}

export interface FillWindowsResult {
  filled: number;
}
