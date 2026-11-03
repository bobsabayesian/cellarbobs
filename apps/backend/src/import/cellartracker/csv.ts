import { readFileSync } from "fs";

/**
 * Parses RFC 4180 CSV: quoted fields may hold commas, newlines and doubled
 * quotes (""). Returns one object per data row, keyed by the header row.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...data] = rows.filter(
    (r) => !(r.length === 1 && r[0] === ""),
  );
  if (!header) return [];
  return data.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""])),
  );
}

/**
 * CellarTracker exports are Windows-1252. A file someone re-saved as UTF-8
 * is read as UTF-8 instead, so it isn't double-decoded.
 */
export function readCellarTrackerCsv(path: string): Record<string, string>[] {
  const bytes = readFileSync(path);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return parseCsv(text.replace(/^\uFEFF/, ""));
}
