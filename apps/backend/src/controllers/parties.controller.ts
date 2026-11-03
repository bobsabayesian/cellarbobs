import { createHash, randomBytes } from "node:crypto";
import type { Selectable, Transaction } from "kysely";
import type {
  PartyAnswers,
  TastingFormat,
  BottleParty,
  MyPartyReviews,
  CreateParty,
  GuestBottleInput,
  WantToBuyWine,
  PartyDetail,
  PartyGuesses,
  PartyJoinResult,
  PartyReview,
  PartyStructure,
  PartySummary,
  PartyWine,
  PublicParty,
  TastingParty,
  UpsertPartyReview,
} from "@cellarboss/types";
import type { Database } from "@schema/database.js";
import { db } from "@utils/database.js";
import { insertReturning } from "@utils/query-helpers.js";
import { foldKey } from "../import/normalise/text.js";
import { commitWithin, type CreatedRecords } from "./import.controller.js";
import { allowedTags, getTagGroups } from "../party/tags.js";
import {
  describeAnswers,
  getFormat,
  reactionFor,
  readAnswers,
} from "../party/formats.js";

type Trx = Transaction<Database>;
type DbOrTrx = typeof db | Trx;

const LABELS = "ABCDEFGHIJKL".split("");

/** Error the routes turn into a 4xx response. */
export class PartyError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function newSecret(): string {
  return randomBytes(24).toString("base64url");
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE(0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function toParty(row: Selectable<Database["tastingParty"]>): TastingParty {
  return {
    id: Number(row.id),
    title: String(row.title),
    date: String(row.date),
    status: row.status as TastingParty["status"],
    token: String(row.token),
    scoreScale: Number(row.scoreScale) === 5 ? 5 : 100,
    format:
      row.format === "beginner" || row.format === "advanced"
        ? row.format
        : null,
    pacing: row.pacing === "sequential" ? "sequential" : "all",
    hostUserId: String(row.hostUserId),
    createdAt: String(row.createdAt),
    finishedAt: row.finishedAt ? String(row.finishedAt) : null,
  };
}

function toReview(row: {
  id: number;
  partyBottleId: number;
  guestId: number;
  score: number | null;
  tags: string;
  structure: string;
  notes: string;
  guesses: string;
  answers?: string | null;
  updatedAt: string;
}): PartyReview {
  return {
    id: row.id,
    partyBottleId: row.partyBottleId,
    guestId: row.guestId,
    score: row.score === null ? null : Number(row.score),
    tags: parseJson<string[]>(row.tags, []),
    structure: parseJson<PartyStructure>(row.structure, {}),
    notes: row.notes,
    guesses: parseJson<PartyGuesses>(row.guesses, {}),
    answers: parseJson<PartyAnswers>(row.answers, {}),
    updatedAt: row.updatedAt,
  };
}

type WineInfo = Omit<PartyWine, "bottleId" | "size">;

/** The wine behind each vintage, keyed by vintage id. */
export async function getVintageWines(
  vintageIds: number[],
  conn: DbOrTrx = db,
): Promise<Map<number, WineInfo>> {
  const result = new Map<number, WineInfo>();
  if (vintageIds.length === 0) return result;

  const rows = await conn
    .selectFrom("vintage")
    .innerJoin("wine", "wine.id", "vintage.wineId")
    .innerJoin("winemaker", "winemaker.id", "wine.wineMakerId")
    .leftJoin("region", "region.id", "wine.regionId")
    .leftJoin("country", "country.id", "region.countryId")
    .select([
      "vintage.id as vintageId",
      "vintage.year as year",
      "wine.id as wineId",
      "wine.name as wineName",
      "wine.type as type",
      "winemaker.name as winemaker",
      "region.name as region",
      "country.name as country",
    ])
    .where("vintage.id", "in", vintageIds)
    .execute();

  const wineIds = [...new Set(rows.map((r) => r.wineId))];
  const grapeRows = wineIds.length
    ? await conn
        .selectFrom("winegrape")
        .innerJoin("grape", "grape.id", "winegrape.grapeId")
        .select(["winegrape.wineId as wineId", "grape.name as name"])
        .where("winegrape.wineId", "in", wineIds)
        .execute()
    : [];

  for (const row of rows) {
    result.set(row.vintageId, {
      ...row,
      grapes: grapeRows
        .filter((g) => g.wineId === row.wineId)
        .map((g) => g.name),
    });
  }
  return result;
}

/**
 * The full wine for each party bottle: the vintage's wine plus, for cellar
 * bottles, the bottle id and size. Guest bottles are assumed standard size.
 */
export async function getPartyWines(
  partyBottles: { vintageId: number; bottleId: number | null }[],
  conn: DbOrTrx = db,
): Promise<
  (bottle: { vintageId: number; bottleId: number | null }) => PartyWine
> {
  const wines = await getVintageWines(
    [...new Set(partyBottles.map((b) => b.vintageId))],
    conn,
  );
  const bottleIds = partyBottles
    .map((b) => b.bottleId)
    .filter((id): id is number => id !== null);
  const sizes = new Map(
    bottleIds.length
      ? (
          await conn
            .selectFrom("bottle")
            .select(["id", "size"])
            .where("id", "in", bottleIds)
            .execute()
        ).map((b) => [b.id, b.size])
      : [],
  );
  return (bottle) => ({
    ...wines.get(bottle.vintageId)!,
    bottleId: bottle.bottleId,
    size:
      (bottle.bottleId !== null && sizes.get(bottle.bottleId)) || "standard",
  });
}

/** The vintage of a wine for a year, created if the wine list lacks it. */
async function resolveVintage(
  trx: Trx,
  input: { wineId: number; year: number | null },
): Promise<{ id: number; created: boolean }> {
  const wine = await trx
    .selectFrom("wine")
    .select("id")
    .where("id", "=", input.wineId)
    .executeTakeFirst();
  if (!wine) throw new PartyError(`Wine ${input.wineId} does not exist`, 404);
  const existing = await trx
    .selectFrom("vintage")
    .select("id")
    .where("wineId", "=", input.wineId)
    .where("year", input.year === null ? "is" : "=", input.year)
    .executeTakeFirst();
  if (existing) return { id: existing.id, created: false };
  const created = await insertReturning(trx, "vintage", {
    wineId: input.wineId,
    year: input.year,
    drinkFrom: null,
    drinkUntil: null,
  });
  return { id: created.id, created: true };
}

type GuestEntry = {
  bottleId: number;
  vintageId: number;
  broughtBy: string;
  createdRecords: string | null;
};

/**
 * Everything a guest's bottle needs: the vintage (from the wine list, or a
 * new wine via the import commit) and an inventory bottle that's out for the
 * tasting. Records it inserted are returned so cancelling can remove them.
 */
async function createGuestBottle(
  trx: Trx,
  party: Pick<TastingParty, "date">,
  input: GuestBottleInput,
): Promise<GuestEntry> {
  const created: CreatedRecords = {};
  let vintageId: number;
  if ("newWine" in input) {
    const result = await commitWithin(trx, input.newWine);
    vintageId = result.vintageId;
    Object.assign(created, result.createdRecords);
  } else {
    const vintage = await resolveVintage(trx, input);
    vintageId = vintage.id;
    if (vintage.created) created.vintageId = vintage.id;
  }
  const bottle = await insertReturning(trx, "bottle", {
    vintageId,
    purchaseDate: party.date,
    purchasePrice: 0,
    storageId: null,
    status: "in-tasting",
    size: "standard",
  });
  return {
    bottleId: bottle.id,
    vintageId,
    broughtBy: input.broughtBy?.trim() || "A guest",
    createdRecords: Object.keys(created).length
      ? JSON.stringify(created)
      : null,
  };
}

/**
 * Removes a guest's bottle and then whatever wine records the party created
 * for it, but only those nothing else uses: the vintage if no bottle, note,
 * image or party bottle refers to it, then the wine if it has no vintages,
 * then the winemaker if it has no wines.
 */
async function removeGuestBottle(
  trx: Trx,
  bottleId: number,
  createdRecords: string | null,
) {
  // Cascades to the party bottle and its reviews.
  await trx.deleteFrom("bottle").where("id", "=", bottleId).execute();
  const created = parseJson<CreatedRecords>(createdRecords, {});
  const uses = async (
    table:
      "bottle" | "tastingNote" | "image" | "partyBottle" | "vintage" | "wine",
    column: "vintageId" | "wineId" | "wineMakerId",
    value: number,
  ) =>
    Number(
      (
        await trx
          .selectFrom(table)
          .select((eb) => eb.fn.countAll().as("n"))
          .where(column as never, "=", value as never)
          .executeTakeFirstOrThrow()
      ).n,
    );

  if (created.vintageId) {
    const total =
      (await uses("bottle", "vintageId", created.vintageId)) +
      (await uses("tastingNote", "vintageId", created.vintageId)) +
      (await uses("image", "vintageId", created.vintageId)) +
      (await uses("partyBottle", "vintageId", created.vintageId));
    if (total === 0)
      await trx
        .deleteFrom("vintage")
        .where("id", "=", created.vintageId)
        .execute();
  }
  if (
    created.wineId &&
    (await uses("vintage", "wineId", created.wineId)) === 0
  ) {
    await trx
      .deleteFrom("winegrape")
      .where("wineId", "=", created.wineId)
      .execute();
    await trx.deleteFrom("wine").where("id", "=", created.wineId).execute();
  }
  if (
    created.winemakerId &&
    (await uses("wine", "wineMakerId", created.winemakerId)) === 0
  )
    await trx
      .deleteFrom("winemaker")
      .where("id", "=", created.winemakerId)
      .execute();
}

async function requireParty(
  id: number,
  conn: DbOrTrx = db,
): Promise<TastingParty> {
  const row = await conn
    .selectFrom("tastingParty")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) throw new PartyError("Party not found", 404);
  return toParty(row);
}

function requireActive(party: TastingParty) {
  if (party.status !== "active")
    throw new PartyError(`Party is ${party.status}`, 409);
}

// --- host ------------------------------------------------------------------

export async function create(
  data: CreateParty,
  host: { id: string; name: string },
): Promise<PartyDetail> {
  const partyId = await db.transaction().execute(async (trx) => {
    const bottles = data.bottleIds.length
      ? await trx
          .selectFrom("bottle")
          .select(["id", "status", "vintageId"])
          .where("id", "in", data.bottleIds)
          .execute()
      : [];
    if (bottles.length !== data.bottleIds.length)
      throw new PartyError("Some bottles do not exist", 404);
    const unavailable = bottles.filter((b) => b.status !== "stored");
    if (unavailable.length)
      throw new PartyError(
        `Bottles must be stored to pour them (not available: ${unavailable.map((b) => b.id).join(", ")})`,
        409,
      );

    const now = new Date().toISOString();
    const party = await insertReturning(trx, "tastingParty", {
      title: data.title,
      date: data.date,
      status: "active",
      token: randomBytes(24).toString("base64url"),
      // Beginner rates with reactions, stored on the 100-point scale.
      scoreScale: data.format === "beginner" ? 100 : data.scoreScale,
      format: data.format ?? "beginner",
      pacing: data.pacing ?? "all",
      hostUserId: host.id,
      createdAt: now,
      finishedAt: null,
    });

    const entries: {
      bottleId: number;
      vintageId: number;
      broughtBy: string | null;
      createdRecords: string | null;
    }[] = bottles.map((b) => ({
      bottleId: b.id,
      vintageId: b.vintageId,
      broughtBy: null,
      createdRecords: null,
    }));
    for (const guest of data.guestBottles ?? [])
      entries.push(await createGuestBottle(trx, party, guest));

    // Labels in a random order, so A-B-C doesn't give away the shelf order
    // or which bottles the guests brought.
    for (const [position, entry] of shuffle(entries).entries()) {
      await insertReturning(trx, "partyBottle", {
        partyId: party.id,
        ...entry,
        label: LABELS[position],
        position,
        // One at a time: nothing is poured until the host pours it.
        pouredAt: data.pacing === "sequential" ? null : now,
        revealedAt: null,
        wantToBuy: 0,
      });
    }
    if (data.bottleIds.length)
      await trx
        .updateTable("bottle")
        .set({ status: "in-tasting" })
        .where("id", "in", data.bottleIds)
        .execute();

    await insertReturning(trx, "partyGuest", {
      partyId: party.id,
      name: host.name || "Host",
      nameKey: foldKey(host.name || "Host"),
      secretHash: hashSecret(newSecret()),
      userId: host.id,
      createdAt: now,
    });
    return party.id;
  });
  return getDetail(partyId);
}

/** Adds a bottle a guest brought to a running party, under the next label. */
export async function addGuestBottle(
  id: number,
  input: GuestBottleInput,
): Promise<PartyDetail> {
  await db.transaction().execute(async (trx) => {
    const party = await requireParty(id, trx);
    requireActive(party);
    const existing = await trx
      .selectFrom("partyBottle")
      .select(["label", "position"])
      .where("partyId", "=", id)
      .execute();
    const used = new Set(existing.map((b) => b.label));
    const label = LABELS.find((l) => !used.has(l));
    if (!label)
      throw new PartyError(
        `A party can have at most ${LABELS.length} bottles`,
        409,
      );
    await insertReturning(trx, "partyBottle", {
      partyId: id,
      ...(await createGuestBottle(trx, party, input)),
      label,
      position: Math.max(-1, ...existing.map((b) => b.position)) + 1,
      pouredAt: party.pacing === "sequential" ? null : new Date().toISOString(),
      revealedAt: null,
      wantToBuy: 0,
    });
  });
  return getDetail(id);
}

/** Takes a bottle back out of a running party, if nobody has rated it yet. */
export async function removeBottle(
  id: number,
  partyBottleId: number,
): Promise<PartyDetail> {
  await db.transaction().execute(async (trx) => {
    const party = await requireParty(id, trx);
    requireActive(party);
    const bottle = await trx
      .selectFrom("partyBottle")
      .select(["id", "bottleId", "broughtBy", "createdRecords"])
      .where("id", "=", partyBottleId)
      .where("partyId", "=", id)
      .executeTakeFirst();
    if (!bottle) throw new PartyError("Bottle is not in this party", 404);
    const reviewed = await trx
      .selectFrom("partyReview")
      .select("id")
      .where("partyBottleId", "=", partyBottleId)
      .executeTakeFirst();
    if (reviewed)
      throw new PartyError("Guests have already rated this bottle", 409);
    if (bottle.broughtBy !== null && bottle.bottleId !== null) {
      await removeGuestBottle(trx, bottle.bottleId, bottle.createdRecords);
      return;
    }
    await trx
      .deleteFrom("partyBottle")
      .where("id", "=", partyBottleId)
      .execute();
    if (bottle.bottleId !== null)
      await trx
        .updateTable("bottle")
        .set({ status: "stored" })
        .where("id", "=", bottle.bottleId)
        .where("status", "=", "in-tasting")
        .execute();
  });
  return getDetail(id);
}

/** Flags (or unflags) a party wine the host wants to buy. Any party status. */
export async function setWantToBuy(
  id: number,
  partyBottleId: number,
  wantToBuy: boolean,
): Promise<PartyDetail> {
  const result = await db
    .updateTable("partyBottle")
    .set({ wantToBuy: wantToBuy ? 1 : 0 })
    .where("id", "=", partyBottleId)
    .where("partyId", "=", id)
    .executeTakeFirst();
  if (Number(result.numUpdatedRows) === 0)
    throw new PartyError("Bottle is not in this party", 404);
  return getDetail(id);
}

export async function list(): Promise<PartySummary[]> {
  const parties = await db
    .selectFrom("tastingParty")
    .selectAll()
    .orderBy("date", "desc")
    .orderBy("id", "desc")
    .execute();
  const count = async (table: "partyBottle" | "partyGuest" | "partyReview") =>
    new Map(
      (
        await db
          .selectFrom(table)
          .select((eb) => ["partyId", eb.fn.countAll().as("n")])
          .groupBy("partyId")
          .execute()
      ).map((r) => [Number(r.partyId), Number(r.n)]),
    );
  const [bottles, guests, reviews] = await Promise.all([
    count("partyBottle"),
    count("partyGuest"),
    count("partyReview"),
  ]);
  return parties.map((row) => {
    const party = toParty(row);
    return {
      ...party,
      bottleCount: bottles.get(party.id) ?? 0,
      guestCount: guests.get(party.id) ?? 0,
      reviewCount: reviews.get(party.id) ?? 0,
    };
  });
}

export async function getDetail(
  id: number,
  conn: DbOrTrx = db,
): Promise<PartyDetail> {
  const party = await requireParty(id, conn);
  const bottles = await conn
    .selectFrom("partyBottle")
    .select([
      "id",
      "partyId",
      "bottleId",
      "vintageId",
      "label",
      "position",
      "pouredAt",
      "revealedAt",
      "broughtBy",
      "wantToBuy",
    ])
    .where("partyId", "=", id)
    .orderBy("position")
    .execute();
  const wineOf = await getPartyWines(bottles, conn);
  const guests = await conn
    .selectFrom("partyGuest")
    .select(["id", "partyId", "name", "userId"])
    .where("partyId", "=", id)
    .orderBy("id")
    .execute();
  const reviews = await conn
    .selectFrom("partyReview")
    .selectAll()
    .where("partyId", "=", id)
    .execute();
  return {
    ...party,
    formatDef: party.format ? getFormat(party.format) : null,
    bottles: bottles.map((b) => ({
      ...b,
      wantToBuy: Number(b.wantToBuy) === 1,
      wine: wineOf(b),
    })),
    guests: guests.map((g) => ({
      id: g.id,
      partyId: g.partyId,
      name: g.name,
      isHost: g.userId !== null,
    })),
    reviews: reviews.map(toReview),
  };
}

/** Pours a bottle: guests can see and rate it from now on. */
export async function pour(
  id: number,
  partyBottleId: number,
): Promise<PartyDetail> {
  const party = await requireParty(id);
  requireActive(party);
  const bottle = await db
    .selectFrom("partyBottle")
    .select(["id", "pouredAt"])
    .where("id", "=", partyBottleId)
    .where("partyId", "=", id)
    .executeTakeFirst();
  if (!bottle) throw new PartyError("Bottle is not in this party", 404);
  if (!bottle.pouredAt)
    await db
      .updateTable("partyBottle")
      .set({ pouredAt: new Date().toISOString() })
      .where("id", "=", partyBottleId)
      .execute();
  return getDetail(id);
}

export async function reveal(
  id: number,
  partyBottleId: number,
): Promise<PartyDetail> {
  const party = await requireParty(id);
  requireActive(party);
  const target = await db
    .selectFrom("partyBottle")
    .select("pouredAt")
    .where("id", "=", partyBottleId)
    .where("partyId", "=", id)
    .executeTakeFirst();
  if (target && !target.pouredAt)
    throw new PartyError("Pour this bottle before revealing it", 409);
  const result = await db
    .updateTable("partyBottle")
    .set({ revealedAt: new Date().toISOString() })
    .where("id", "=", partyBottleId)
    .where("partyId", "=", id)
    .where("revealedAt", "is", null)
    .executeTakeFirst();
  if (Number(result.numUpdatedRows) === 0) {
    const exists = await db
      .selectFrom("partyBottle")
      .select("id")
      .where("id", "=", partyBottleId)
      .where("partyId", "=", id)
      .executeTakeFirst();
    if (!exists) throw new PartyError("Bottle is not in this party", 404);
  }
  return getDetail(id);
}

/** Text of the tasting note saved from a host's blind review. */
/** A stored score as shown for the party: a reaction, stars or points. */
export function scoreLabel(
  score: number | null,
  party: Pick<TastingParty, "scoreScale"> & {
    formatDef?: TastingFormat | null;
  },
): string {
  if (score === null) return "unscored";
  const reaction = party.formatDef ? reactionFor(party.formatDef, score) : null;
  if (reaction) return reaction;
  return party.scoreScale === 5
    ? `${Math.round(score / 20)}/5 stars`
    : `${score}/100`;
}

export function hostNoteText(
  review: PartyReview,
  party: Pick<TastingParty, "title" | "scoreScale"> & {
    formatDef?: TastingFormat | null;
  },
  label: string,
): string {
  const lines: string[] = [];
  if (review.notes.trim()) lines.push(review.notes.trim());
  if (review.tags.length) lines.push(`Tags: ${review.tags.join(", ")}`);
  if (party.formatDef) {
    // Format answers by their labels ("Finish length: long").
    const described = describeAnswers(party.formatDef, review.answers);
    if (described.length) lines.push(described.join("\n"));
  } else {
    const structure = Object.entries(review.structure)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k} ${v}/5`);
    if (structure.length) lines.push(`Structure: ${structure.join(", ")}`);
  }
  const guesses = Object.entries(review.guesses)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k} ${v}`);
  if (guesses.length) lines.push(`Guessed: ${guesses.join(", ")}`);
  lines.push(
    `Blind tasting "${party.title}", bottle ${label}: ${scoreLabel(review.score, party)}`,
  );
  return lines.join("\n\n");
}

export async function finish(id: number): Promise<PartyDetail> {
  await db.transaction().execute(async (trx) => {
    const party = await requireParty(id, trx);
    requireActive(party);
    const detail = await getDetail(id, trx);

    // Bottles never poured weren't opened: yours go back to their bins,
    // guests' unopened bottles (and wines made for them) are removed.
    const unpoured = await trx
      .selectFrom("partyBottle")
      .select(["bottleId", "broughtBy", "createdRecords"])
      .where("partyId", "=", id)
      .where("pouredAt", "is", null)
      .where("bottleId", "is not", null)
      .execute();
    for (const b of unpoured) {
      if (b.broughtBy !== null)
        await removeGuestBottle(trx, b.bottleId as number, b.createdRecords);
      else
        await trx
          .updateTable("bottle")
          .set({ status: "stored" })
          .where("id", "=", b.bottleId as number)
          .where("status", "=", "in-tasting")
          .execute();
    }

    // Every bottle poured is now drunk; guests' bottles say who brought them.
    for (const b of detail.bottles) {
      if (b.bottleId === null || b.pouredAt === null) continue;
      await trx
        .updateTable("bottle")
        .set({
          status: "drunk",
          consumedDate: party.date,
          consumedNote: b.broughtBy
            ? `Brought by ${b.broughtBy} · Blind tasting: ${party.title}`
            : `Blind tasting: ${party.title}`,
        })
        .where("id", "=", b.bottleId)
        .where("status", "=", "in-tasting")
        .execute();
    }

    // The host's blind reviews become regular tasting notes.
    const hostGuestIds = new Set(
      detail.guests.filter((g) => g.isHost).map((g) => g.id),
    );
    for (const review of detail.reviews) {
      if (!hostGuestIds.has(review.guestId)) continue;
      if (review.score === null && !review.notes.trim()) continue;
      const bottle = detail.bottles.find((b) => b.id === review.partyBottleId)!;
      await insertReturning(trx, "tastingNote", {
        vintageId: bottle.wine.vintageId,
        authorId: party.hostUserId,
        date: `${party.date}T20:00:00.000Z`,
        score:
          review.score === null
            ? 0
            : Math.min(10, Math.max(0, Math.round(review.score / 10))),
        notes: hostNoteText(review, detail, bottle.label),
      });
    }

    await trx
      .updateTable("tastingParty")
      .set({ status: "finished", finishedAt: new Date().toISOString() })
      .where("id", "=", id)
      .execute();
  });
  return getDetail(id);
}

export async function cancel(id: number): Promise<PartyDetail> {
  await db.transaction().execute(async (trx) => {
    const party = await requireParty(id, trx);
    requireActive(party);
    const partyBottles = await trx
      .selectFrom("partyBottle")
      .select(["bottleId", "broughtBy", "createdRecords"])
      .where("partyId", "=", id)
      .where("bottleId", "is not", null)
      .execute();
    // Guests' bottles, and wine records made for them, go away entirely.
    for (const b of partyBottles)
      if (b.broughtBy !== null)
        await removeGuestBottle(trx, b.bottleId as number, b.createdRecords);
    const bottleIds = partyBottles
      .filter((b) => b.broughtBy === null)
      .map((b) => b.bottleId as number);
    if (bottleIds.length)
      await trx
        .updateTable("bottle")
        .set({ status: "stored" })
        .where("id", "in", bottleIds)
        .where("status", "=", "in-tasting")
        .execute();
    await trx
      .updateTable("tastingParty")
      .set({ status: "cancelled", finishedAt: new Date().toISOString() })
      .where("id", "=", id)
      .execute();
  });
  return getDetail(id);
}

/** A fresh guest secret for the host, so they can rate on the guest page. */
export async function hostSession(
  id: number,
  userId: string,
): Promise<PartyJoinResult & { token: string }> {
  const party = await requireParty(id);
  requireActive(party);
  const guest = await db
    .selectFrom("partyGuest")
    .select(["id", "name"])
    .where("partyId", "=", id)
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (!guest) throw new PartyError("Only the host can rate as host", 403);
  const secret = newSecret();
  await db
    .updateTable("partyGuest")
    .set({ secretHash: hashSecret(secret) })
    .where("id", "=", guest.id)
    .execute();
  return { guestId: guest.id, name: guest.name, secret, token: party.token };
}

// --- guests (public, by token) ---------------------------------------------

/**
 * A party by its guest token, for reading: active or finished. Finished
 * parties stay readable so guests can see the results and download their
 * notes. Cancelled parties look the same as unknown tokens.
 */
async function partyByToken(token: string): Promise<TastingParty> {
  const row = await db
    .selectFrom("tastingParty")
    .selectAll()
    .where("token", "=", token)
    .executeTakeFirst();
  if (!row || row.status === "cancelled")
    throw new PartyError("Party not found", 404);
  return toParty(row);
}

/** A party by its guest token, for joining and rating: active only. */
async function activeByToken(token: string): Promise<TastingParty> {
  const party = await partyByToken(token);
  if (party.status !== "active")
    throw new PartyError("This tasting has ended", 409);
  return party;
}

async function guestFor(partyId: number, secret: string | undefined) {
  if (!secret) throw new PartyError("Join the party first", 403);
  const guest = await db
    .selectFrom("partyGuest")
    .select(["id", "name", "userId"])
    .where("partyId", "=", partyId)
    .where("secretHash", "=", hashSecret(secret))
    .executeTakeFirst();
  if (!guest) throw new PartyError("Join the party first", 403);
  return guest;
}

export async function publicView(token: string): Promise<PublicParty> {
  const party = await partyByToken(token);
  const detail = await getDetail(party.id);
  const guestNames = new Map(detail.guests.map((g) => [g.id, g.name]));
  return {
    title: party.title,
    date: party.date,
    status: party.status,
    scoreScale: party.scoreScale,
    tagGroups: getTagGroups(),
    format: party.format ? getFormat(party.format) : null,
    // Guests only ever see poured bottles, so they can't tell what's coming.
    bottles: detail.bottles
      .filter((b) => b.pouredAt !== null)
      .map((b) => {
        // Everything is revealed once the party is over.
        const revealed = b.revealedAt !== null || party.status === "finished";
        return {
          label: b.label,
          revealed,
          wine: revealed ? b.wine : null,
          broughtBy: revealed ? b.broughtBy : null,
          scores: revealed
            ? detail.reviews
                .filter((r) => r.partyBottleId === b.id)
                .map((r) => ({
                  guest: guestNames.get(r.guestId) ?? "?",
                  score: r.score,
                }))
            : null,
        };
      }),
  };
}

export async function join(
  token: string,
  name: string,
): Promise<PartyJoinResult> {
  const party = await activeByToken(token);
  const guestCount = await db
    .selectFrom("partyGuest")
    .select((eb) => eb.fn.countAll().as("n"))
    .where("partyId", "=", party.id)
    .executeTakeFirstOrThrow();
  if (Number(guestCount.n) >= 50)
    throw new PartyError("This party is full", 409);
  const secret = newSecret();
  const guest = await insertReturning(db, "partyGuest", {
    partyId: party.id,
    name,
    nameKey: foldKey(name),
    secretHash: hashSecret(secret),
    userId: null,
    createdAt: new Date().toISOString(),
  });
  return { guestId: guest.id, name: guest.name, secret };
}

export async function myReviews(
  token: string,
  secret: string | undefined,
): Promise<MyPartyReviews> {
  const party = await partyByToken(token);
  const guest = await guestFor(party.id, secret);
  const rows = await db
    .selectFrom("partyReview")
    .innerJoin("partyBottle", "partyBottle.id", "partyReview.partyBottleId")
    .selectAll("partyReview")
    .select("partyBottle.label as label")
    .where("partyReview.guestId", "=", guest.id)
    .execute();
  const isHost = guest.userId !== null;
  return {
    name: guest.name,
    isHost,
    // Only the host gets the party id (for the link back to the console).
    partyId: isHost ? party.id : null,
    reviews: rows.map((r) => ({ ...toReview(r), label: r.label })),
  };
}

/** A guest's own party and reviews, for their notes PDF. */
export async function guestNotes(token: string, secret: string | undefined) {
  const party = await partyByToken(token);
  const guest = await guestFor(party.id, secret);
  return { party: await getDetail(party.id), guestId: guest.id };
}

/** Parties a bottle was poured at (normally one), newest first. */
export async function partiesForBottle(
  bottleId: number,
): Promise<BottleParty[]> {
  const rows = await db
    .selectFrom("partyBottle")
    .innerJoin("tastingParty", "tastingParty.id", "partyBottle.partyId")
    .select([
      "tastingParty.id as id",
      "tastingParty.title as title",
      "tastingParty.date as date",
      "tastingParty.status as status",
      "partyBottle.label as label",
      "partyBottle.broughtBy as broughtBy",
    ])
    .where("partyBottle.bottleId", "=", bottleId)
    .orderBy("tastingParty.date", "desc")
    .execute();
  return rows.map((r) => ({ ...r, status: r.status as BottleParty["status"] }));
}

export async function upsertReview(
  token: string,
  secret: string | undefined,
  label: string,
  data: UpsertPartyReview,
): Promise<PartyReview> {
  const party = await activeByToken(token);
  const guest = await guestFor(party.id, secret);
  if (party.format) {
    // Format parties answer the format's questions; tags and structure are
    // derived from the answers, never sent directly.
    if (data.tags !== undefined || data.structure !== undefined)
      throw new PartyError(
        "This party uses a tasting format; send answers instead",
        400,
      );
    const format = getFormat(party.format);
    if (data.answers !== undefined) {
      try {
        const read = readAnswers(format, data.answers);
        data = {
          ...data,
          answers: read.answers,
          tags: read.tags,
          structure: read.structure,
        };
      } catch (err) {
        throw new PartyError((err as Error).message, 400);
      }
    }
    if (
      format.rating.kind === "reaction" &&
      data.score !== undefined &&
      data.score !== null &&
      !format.rating.options.some((o) => o.score === data.score)
    )
      throw new PartyError("Pick one of the reactions", 400);
  } else {
    if (data.answers !== undefined)
      throw new PartyError("This party has no tasting format", 400);
    if (data.tags) {
      const allowed = allowedTags();
      const unknown = data.tags.filter((t) => !allowed.has(t.toLowerCase()));
      if (unknown.length)
        throw new PartyError(`Unknown tags: ${unknown.join(", ")}`, 400);
    }
  }
  const bottle = await db
    .selectFrom("partyBottle")
    .select(["id"])
    .where("partyId", "=", party.id)
    .where("label", "=", label.toUpperCase())
    .where("pouredAt", "is not", null)
    .executeTakeFirst();
  if (!bottle) throw new PartyError("No such bottle", 404);

  const existing = await db
    .selectFrom("partyReview")
    .selectAll()
    .where("guestId", "=", guest.id)
    .where("partyBottleId", "=", bottle.id)
    .executeTakeFirst();
  const now = new Date().toISOString();

  if (existing) {
    await db
      .updateTable("partyReview")
      .set({
        ...(data.score !== undefined && { score: data.score }),
        ...(data.tags !== undefined && { tags: JSON.stringify(data.tags) }),
        ...(data.structure !== undefined && {
          structure: JSON.stringify(data.structure),
        }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.guesses !== undefined && {
          guesses: JSON.stringify(data.guesses),
        }),
        ...(data.answers !== undefined && {
          answers: JSON.stringify(data.answers),
        }),
        updatedAt: now,
      })
      .where("id", "=", existing.id)
      .execute();
    const row = await db
      .selectFrom("partyReview")
      .selectAll()
      .where("id", "=", existing.id)
      .executeTakeFirstOrThrow();
    return toReview(row);
  }

  const row = await insertReturning(db, "partyReview", {
    partyId: party.id,
    partyBottleId: bottle.id,
    guestId: guest.id,
    score: data.score ?? null,
    tags: JSON.stringify(data.tags ?? []),
    structure: JSON.stringify(data.structure ?? {}),
    notes: data.notes ?? "",
    guesses: JSON.stringify(data.guesses ?? {}),
    answers: JSON.stringify(data.answers ?? {}),
    updatedAt: now,
  });
  return toReview(row);
}

// --- analysis ----------------------------------------------------------------

/** One row per review, joined to the wine, for the palate engine and export. */
export interface ReviewRow {
  partyId: number;
  partyTitle: string;
  partyDate: string;
  label: string;
  guest: string;
  guestKey: string;
  isHost: boolean;
  score: number | null;
  tags: string[];
  structure: PartyStructure;
  notes: string;
  guesses: PartyGuesses;
  /** Format answers, and "Label: value" strings for the palate stats. */
  answers: PartyAnswers;
  attributes: string[];
  /** Null for the host's own bottles. */
  broughtBy: string | null;
  wantToBuy: boolean;
  wine: PartyWine;
}

/**
 * "Finish length: long"-style attributes from a review's format answers, for
 * grouping in the palate profile. Aroma tags are already counted as tags.
 */
function attributesOf(format: string | null, answers: PartyAnswers): string[] {
  if (format !== "beginner" && format !== "advanced") return [];
  const out: string[] = [];
  for (const step of getFormat(format).steps)
    for (const block of step.blocks)
      for (const field of block.fields) {
        const value = answers[field.key];
        if (value === undefined || field.tag) continue;
        for (const v of Array.isArray(value) ? value : [value])
          out.push(`${field.label}: ${v}`);
      }
  return out;
}

/** Reviews of revealed bottles in finished or active parties. */
export async function reviewRows(): Promise<ReviewRow[]> {
  const rows = await db
    .selectFrom("partyReview")
    .innerJoin("partyBottle", "partyBottle.id", "partyReview.partyBottleId")
    .innerJoin("tastingParty", "tastingParty.id", "partyReview.partyId")
    .innerJoin("partyGuest", "partyGuest.id", "partyReview.guestId")
    .selectAll("partyReview")
    .select([
      "partyBottle.label as label",
      "partyBottle.bottleId as bottleId",
      "partyBottle.vintageId as vintageId",
      "partyBottle.broughtBy as broughtBy",
      "partyBottle.wantToBuy as wantToBuy",
      "partyBottle.revealedAt as revealedAt",
      "tastingParty.title as partyTitle",
      "tastingParty.date as partyDate",
      "tastingParty.status as partyStatus",
      "tastingParty.format as partyFormat",
      "partyGuest.name as guest",
      "partyGuest.nameKey as guestKey",
      "partyGuest.userId as guestUserId",
    ])
    .where("tastingParty.status", "!=", "cancelled")
    .execute();
  const visible = rows.filter(
    (r) => r.partyStatus === "finished" || r.revealedAt !== null,
  );
  const wineOf = await getPartyWines(visible);
  return visible.map((r) => {
    const review = toReview(r);
    return {
      partyId: r.partyId,
      partyTitle: r.partyTitle,
      partyDate: r.partyDate,
      label: r.label,
      guest: r.guest,
      guestKey: r.guestKey,
      isHost: r.guestUserId !== null,
      score: review.score,
      tags: review.tags,
      structure: review.structure,
      notes: review.notes,
      guesses: review.guesses,
      answers: review.answers,
      attributes: attributesOf(r.partyFormat, review.answers),
      broughtBy: r.broughtBy,
      wantToBuy: Number(r.wantToBuy) === 1,
      wine: wineOf(r),
    };
  });
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Flat CSV of every visible review, one row per review. */
export async function exportCsv(): Promise<string> {
  const rows = await reviewRows();
  const header = [
    "partyId",
    "partyTitle",
    "partyDate",
    "label",
    "guest",
    "isHost",
    "score",
    "acidity",
    "tannin",
    "body",
    "oak",
    "tags",
    "notes",
    "guessGrape",
    "guessRegion",
    "guessCountry",
    "guessVintage",
    "winemaker",
    "wine",
    "vintage",
    "type",
    "region",
    "country",
    "grapes",
    "ageAtTasting",
    "source",
    "broughtBy",
    "wantToBuy",
    "answers",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const age =
      r.wine.year === null ? "" : Number(r.partyDate.slice(0, 4)) - r.wine.year;
    lines.push(
      [
        r.partyId,
        r.partyTitle,
        r.partyDate,
        r.label,
        r.guest,
        r.isHost,
        r.score,
        r.structure.acidity,
        r.structure.tannin,
        r.structure.body,
        r.structure.oak,
        r.tags.join("|"),
        r.notes,
        r.guesses.grape,
        r.guesses.region,
        r.guesses.country,
        r.guesses.vintage,
        r.wine.winemaker,
        r.wine.wineName,
        r.wine.year,
        r.wine.type,
        r.wine.region,
        r.wine.country,
        r.wine.grapes.join("|"),
        age,
        r.wine.bottleId === null ? "guest" : "cellar",
        r.broughtBy,
        r.wantToBuy,
        Object.keys(r.answers).length ? JSON.stringify(r.answers) : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Party wines the host flagged to buy, newest party first, with scores. */
export async function wantToBuyList(): Promise<WantToBuyWine[]> {
  const flagged = await db
    .selectFrom("partyBottle")
    .innerJoin("tastingParty", "tastingParty.id", "partyBottle.partyId")
    .select([
      "partyBottle.id as id",
      "partyBottle.partyId as partyId",
      "partyBottle.label as label",
      "partyBottle.bottleId as bottleId",
      "partyBottle.vintageId as vintageId",
      "partyBottle.broughtBy as broughtBy",
      "tastingParty.title as partyTitle",
      "tastingParty.date as partyDate",
    ])
    .where("partyBottle.wantToBuy", "=", 1)
    .orderBy("tastingParty.date", "desc")
    .execute();
  if (flagged.length === 0) return [];

  const wineOf = await getPartyWines(flagged);
  const reviews = await db
    .selectFrom("partyReview")
    .innerJoin("partyGuest", "partyGuest.id", "partyReview.guestId")
    .select([
      "partyReview.partyBottleId as partyBottleId",
      "partyReview.score as score",
      "partyGuest.userId as userId",
    ])
    .where(
      "partyReview.partyBottleId",
      "in",
      flagged.map((f) => f.id),
    )
    .execute();

  return flagged.map((f) => {
    const scores = reviews.filter(
      (r) => r.partyBottleId === f.id && r.score !== null,
    );
    const host = scores.find((r) => r.userId !== null);
    return {
      partyId: f.partyId,
      partyTitle: f.partyTitle,
      partyDate: f.partyDate,
      label: f.label,
      broughtBy: f.broughtBy,
      wine: wineOf(f),
      hostScore: host ? Number(host.score) : null,
      averageScore: scores.length
        ? Math.round(
            (scores.reduce((a, r) => a + Number(r.score), 0) / scores.length) *
              10,
          ) / 10
        : null,
      scoreCount: scores.length,
    };
  });
}
