import { cleanText } from "../normalise/text.js";
import {
  parseCtDate,
  planWineAndVintage,
  type Plan,
  type PlannedVintage,
  type PlannedWine,
  type Row,
} from "./plan.js";

export interface PlannedNote {
  vintageKey: string;
  /** ISO datetime; noon UTC so the tasting date shows the same everywhere. */
  date: string;
  score: number;
  notes: string;
}

export interface NotesPlan {
  notes: PlannedNote[];
  /** Wines and vintages only known from notes (tasted, never owned). */
  extraWines: Map<string, PlannedWine>;
  extraVintages: Map<string, PlannedVintage>;
  skipped: string[];
  warnings: string[];
}

/** CellarTracker rates out of 100; CellarBoss scores whole numbers out of 10. */
export function toScore(rating: string): number | null {
  const n = Number(rating);
  if (!rating.trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(10, Math.max(0, Math.round(n / 10)));
}

function column(row: Row, ...names: string[]): string {
  for (const name of names) if (row[name] !== undefined) return row[name];
  return "";
}

/** Plans tasting notes from a CellarTracker "Notes" export. */
export function planNotes(rows: Row[], plan: Plan): NotesPlan {
  const result: NotesPlan = {
    notes: [],
    extraWines: new Map(),
    extraVintages: new Map(),
    skipped: [],
    warnings: [],
  };
  if (rows.length === 0) return result;

  const header = Object.keys(rows[0]);
  if (header.includes("iConsumed") || !header.includes("iWine")) {
    result.warnings.push(
      "notes.csv is not a CellarTracker Notes export (it looks like " +
        (header.includes("iConsumed")
          ? "the Consumed table"
          : "something else") +
        "); no tasting notes imported. Re-download Table=Notes.",
    );
    return result;
  }

  let unrated = 0;
  for (const row of rows) {
    const text = cleanText(
      column(row, "TastingNotes", "Notes", "Note", "TastingNote"),
    );
    const date = parseCtDate(column(row, "TastingDate", "Date"));
    const score = toScore(column(row, "Rating", "Score"));
    const label = `${column(row, "Vintage")} ${column(row, "Wine")}`.trim();

    if (!text && score === null) {
      result.skipped.push(`${label}: no text or rating`);
      continue;
    }

    let vintageKey = plan.vintageByIWine.get(row.iWine);
    if (!vintageKey) {
      if (!column(row, "Wine")) {
        result.skipped.push(
          `iWine ${row.iWine}: not in bottles.csv and no wine details`,
        );
        continue;
      }
      const { wine, vintage } = planWineAndVintage(row);
      if (!plan.wines.has(wine.key)) result.extraWines.set(wine.key, wine);
      if (!plan.vintages.has(vintage.key))
        result.extraVintages.set(vintage.key, vintage);
      vintageKey = vintage.key;
    }

    if (score === null) unrated++;
    // Scores out of 10 lose detail (85-94 all become 9), so the original
    // rating is kept in the text.
    const rating = column(row, "Rating", "Score").trim();
    const defective = column(row, "Defective").toLowerCase() === "true";
    result.notes.push({
      vintageKey,
      date: `${date ?? "1970-01-01"}T12:00:00.000Z`,
      score: score ?? 0,
      notes: [
        defective ? "Defective bottle." : "",
        text,
        score !== null ? `CellarTracker rating: ${rating}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    if (!date) result.warnings.push(`${label}: no tasting date`);
  }

  if (unrated)
    result.warnings.push(
      `${unrated} tasting notes have no rating; imported with score 0`,
    );
  return result;
}
