import type { ColumnType, Generated } from "kysely";
import type {
  Bottle,
  Country,
  Grape,
  Image,
  Location,
  Region,
  Storage,
  TastingNote,
  Vintage,
  Wine,
  WineGrape,
  WineMaker,
  Setting,
  Preference,
} from "@cellarboss/types";

// Kysely table definitions - wrap auto-increment IDs with Generated<>
export interface BottleTable extends Omit<Bottle, "id"> {
  id: Generated<number>;
}

export interface CountryTable extends Omit<Country, "id"> {
  id: Generated<number>;
}

export interface GrapeTable extends Omit<Grape, "id"> {
  id: Generated<number>;
}

export interface LocationTable extends Omit<Location, "id"> {
  id: Generated<number>;
  /** Who added it, so they see it before any storage in it is visible. */
  createdBy?: string | null;
}

export interface CatalogSeenTable {
  id: Generated<number>;
  kind: "vintage" | "wine" | "winemaker" | "grape" | "region" | "country";
  recordId: number;
  userId: string;
}

export interface StorageAccessTable {
  id: Generated<number>;
  storageId: number;
  userId: string;
  level: "view" | "edit";
  createdAt: string;
}

export interface RegionTable extends Omit<Region, "id"> {
  id: Generated<number>;
}

export interface StorageTable extends Omit<Storage, "id"> {
  id: Generated<number>;
}

export interface VintageTable extends Omit<Vintage, "id"> {
  id: Generated<number>;
}

export interface WineTable extends Omit<Wine, "id"> {
  id: Generated<number>;
}

export interface WineGrapeTable extends Omit<WineGrape, "id"> {
  id: Generated<number>;
}

export interface WineMakerTable extends Omit<WineMaker, "id"> {
  id: Generated<number>;
}

export interface TastingNoteTable extends Omit<
  TastingNote,
  "id" | "author" | "answers" | "format"
> {
  id: Generated<number>;
  format: TastingNote["format"];
  /** JSON of the format's answers. */
  answers: string | null;
}

export interface ImageTable extends Omit<Image, "id" | "isFavourite"> {
  id: Generated<number>;
  // SQLite stores as 0/1; coerced to boolean in the controller. Optional on insert (DB default 0).
  isFavourite: ColumnType<number, number | undefined, number>;
}

export interface TastingPartyTable {
  id: Generated<number>;
  title: string;
  date: string;
  status: "active" | "finished" | "cancelled";
  token: string;
  scoreScale: number;
  // "beginner" | "advanced"; null before formats (migration 024)
  format: string | null;
  // "all" | "sequential"; null before migration 025 (behaves as "all")
  pacing: string | null;
  hostUserId: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface PartyBottleTable {
  id: Generated<number>;
  partyId: number;
  bottleId: number | null;
  vintageId: number;
  label: string;
  position: number;
  pouredAt: string | null;
  revealedAt: string | null;
  broughtBy: string | null;
  // 0/1 on every dialect (integer column, see migration 022)
  wantToBuy: ColumnType<number, number | undefined, number>;
  // JSON {winemakerId?, wineId?, vintageId?} the party created (migration 023)
  createdRecords: string | null;
}

export interface PartyGuestTable {
  id: Generated<number>;
  partyId: number;
  name: string;
  nameKey: string;
  secretHash: string;
  userId: string | null;
  createdAt: string;
}

// JSON fields are stored as strings (see migration 021).
export interface PartyReviewTable {
  id: Generated<number>;
  partyId: number;
  partyBottleId: number;
  guestId: number;
  score: number | null;
  tags: string;
  structure: string;
  notes: string;
  guesses: string;
  // JSON format answers by field key (migration 024)
  answers: string | null;
  updatedAt: string;
}

export interface ShareLinkTable {
  id: Generated<number>;
  title: string;
  message: string;
  token: string;
  expiresAt: string;
  revokedAt: string | null;
  maxMarks: number | null;
  createdBy: string;
  createdAt: string;
}

export interface ShareGuestTable {
  id: Generated<number>;
  linkId: number;
  name: string;
  secretHash: string;
  createdAt: string;
}

export interface ShareMarkTable {
  id: Generated<number>;
  linkId: number;
  guestId: number;
  bottleId: number;
  createdAt: string;
}

export type SettingTable = Setting;

export type PreferenceTable = Preference;

// Better Auth managed table. Dates and booleans come back in each dialect's
// native shape (Date or ISO string, boolean or 0/1).
export interface UserTable {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean | number;
  image: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  role: string | null;
  banned: boolean | number | null;
  banReason: string | null;
  banExpires: Date | string | null;
}

// Database interface for Kysely
export interface Database {
  bottle: BottleTable;
  country: CountryTable;
  grape: GrapeTable;
  location: LocationTable;
  region: RegionTable;
  storage: StorageTable;
  storageAccess: StorageAccessTable;
  catalogSeen: CatalogSeenTable;
  vintage: VintageTable;
  wine: WineTable;
  winegrape: WineGrapeTable;
  winemaker: WineMakerTable;
  tastingNote: TastingNoteTable;
  image: ImageTable;
  setting: SettingTable;
  preference: PreferenceTable;
  user: UserTable;
  tastingParty: TastingPartyTable;
  partyBottle: PartyBottleTable;
  partyGuest: PartyGuestTable;
  partyReview: PartyReviewTable;
  shareLink: ShareLinkTable;
  shareGuest: ShareGuestTable;
  shareMark: ShareMarkTable;
}
