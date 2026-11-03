import type { PartyWine } from "./party";

/** active: usable. expired: past expiresAt. revoked: closed by the host. */
export type ShareLinkState = "active" | "expired" | "revoked";

export interface ShareLink {
  id: number;
  title: string;
  message: string;
  token: string;
  expiresAt: string;
  revokedAt: string | null;
  maxMarks: number | null;
  createdAt: string;
  state: ShareLinkState;
}

export interface ShareLinkSummary extends ShareLink {
  guestCount: number;
  markCount: number;
}

/** A marked bottle on the host's pull list. */
export interface ShareMarkDetail {
  id: number;
  guestId: number;
  guest: string;
  bottleId: number;
  createdAt: string;
  wine: PartyWine;
  /** "DomaineE301 › 12", or null when it has no storage. */
  storagePath: string | null;
  /** False once the bottle left the cellar or moved out of "stored". */
  stillStored: boolean;
}

export interface ShareLinkDetail extends ShareLink {
  guests: { id: number; name: string; markCount: number }[];
  marks: ShareMarkDetail[];
}

export interface CreateShareLink {
  title: string;
  message?: string;
  expiresAt: string;
  maxMarks?: number | null;
}

/** One vintage on the shared page: what's available and who took what. */
export interface SharedVintage {
  vintageId: number;
  wine: Omit<PartyWine, "bottleId" | "size">;
  drinkFrom: number | null;
  drinkUntil: number | null;
  /** Unmarked stored bottles that can still be marked. */
  available: number;
  /** Bottles of it the viewer marked, each with its mark id. */
  mine: number[];
  /** Bottles other people (or other links) have set aside. */
  taken: { name: string | null; count: number }[];
  storagePaths: string[];
  notes: { date: string; score: number; notes: string }[];
}

export interface SharedCellar {
  title: string;
  message: string;
  expiresAt: string;
  maxMarks: number | null;
  /** How many marks the viewer has used (null until they join). */
  myMarks: number | null;
  viewerName: string | null;
  vintages: SharedVintage[];
}

/** A link that set a bottle aside, for the bottle page. */
export interface BottleShareMark {
  linkId: number;
  linkTitle: string;
  guest: string;
}
