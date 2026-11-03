import { db } from "@utils/database.js";
import { insertReturning } from "@utils/query-helpers.js";
import type {
  CreateTastingNote,
  PartyAnswers,
  TastingFormat,
  TastingNote,
  TastingNoteFormat,
  UpdateTastingNote,
} from "@cellarboss/types";
import { FORMAT_IDS, getFormat, readAnswers } from "../party/formats.js";

/** A note was rejected (unknown format or answers that don't match it). */
export class TastingNoteError extends Error {}

/** Base query that joins user table to resolve author name */
function baseQuery() {
  return db
    .selectFrom("tastingNote")
    .innerJoin("user", "user.id", "tastingNote.authorId")
    .select([
      "tastingNote.id",
      "tastingNote.vintageId",
      "tastingNote.date",
      "tastingNote.authorId",
      "tastingNote.score",
      "tastingNote.notes",
      "tastingNote.format",
      "tastingNote.answers",
      "user.name as author",
    ]);
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number];

/** Answers are stored as JSON text; older notes have none. */
function toNote(row: Row): TastingNote {
  let answers: PartyAnswers = {};
  if (row.answers) {
    try {
      answers = JSON.parse(row.answers) as PartyAnswers;
    } catch {
      // Unreadable answers are treated as none; the note text is unaffected.
    }
  }
  return { ...row, answers };
}

/** The formats a note can be written in; quick has no questions. */
export function listFormats(): TastingFormat[] {
  return FORMAT_IDS.map((id) => getFormat(id));
}

/** Checks answers against the note's format and returns them as JSON. */
function checkAnswers(
  format: TastingNoteFormat | null | undefined,
  answers: PartyAnswers | undefined,
): string | null {
  if (!answers || Object.keys(answers).length === 0) return null;
  if (!format || format === "quick")
    throw new TastingNoteError("Only beginner and advanced notes have answers");
  try {
    return JSON.stringify(readAnswers(getFormat(format), answers).answers);
  } catch (err) {
    throw new TastingNoteError((err as Error).message);
  }
}

export async function list() {
  return (await baseQuery().execute()).map(toNote);
}

export async function getByVintageId(vintageId: number) {
  return (
    await baseQuery().where("tastingNote.vintageId", "=", vintageId).execute()
  ).map(toNote);
}

export async function getByWineId(wineId: number) {
  return (
    await baseQuery()
      .innerJoin("vintage", "vintage.id", "tastingNote.vintageId")
      .where("vintage.wineId", "=", wineId)
      .execute()
  ).map(toNote);
}

export async function getById(id: number) {
  const row = await baseQuery()
    .where("tastingNote.id", "=", id)
    .executeTakeFirst();
  return row ? toNote(row) : undefined;
}

export async function create(
  data: CreateTastingNote & { authorId: string; date: string },
) {
  const { answers, ...rest } = data;
  const inserted = await insertReturning(db, "tastingNote", {
    ...rest,
    format: data.format ?? null,
    answers: checkAnswers(data.format, answers),
  });
  return (await getById(inserted.id)) as NonNullable<
    Awaited<ReturnType<typeof getById>>
  >;
}

// Uses manual update + getById (not updateReturning) because the response
// includes a JOIN to resolve the author name from the user table.
export async function update(id: number, data: UpdateTastingNote) {
  const { answers, ...rest } = data;
  const set: Record<string, unknown> = { ...rest };
  if (answers !== undefined) {
    const current = await db
      .selectFrom("tastingNote")
      .select("format")
      .where("id", "=", id)
      .executeTakeFirst();
    set.answers = checkAnswers(current?.format, answers);
  }
  await db
    .updateTable("tastingNote")
    .set(set)
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
  return (await getById(id)) as NonNullable<
    Awaited<ReturnType<typeof getById>>
  >;
}

export async function remove(id: number) {
  return await db
    .deleteFrom("tastingNote")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
