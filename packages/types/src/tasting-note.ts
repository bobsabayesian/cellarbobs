import type { PartyAnswers, PartyFormatId } from "./party";

/** How a note was written: just score and text, or a party tasting format. */
export type TastingNoteFormat = "quick" | PartyFormatId;

export interface TastingNote {
  id: number;
  vintageId: number;
  date: string; // ISO 8601 datetime string, set server-side
  authorId: string; // FK to user.id, set server-side
  author: string; // resolved from user table via join (not a DB column)
  score: number; // integer 0–10
  notes: string;
  /** Null for notes from before formats. */
  format?: TastingNoteFormat | null;
  /** The format's answers, keyed by field; empty for quick notes. */
  answers?: PartyAnswers;
}

// Frontend only sends vintageId, score, notes (and format answers) — authorId and date set server-side
export type CreateTastingNote = Pick<
  TastingNote,
  "vintageId" | "score" | "notes" | "format" | "answers"
>;

// Only score, notes and answers are editable after creation
export type UpdateTastingNote = Partial<
  Pick<TastingNote, "score" | "notes" | "answers">
>;
