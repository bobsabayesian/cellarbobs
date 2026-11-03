import { randomBytes } from "node:crypto";
import type { Selectable } from "kysely";
import type {
  BottleShareMark,
  CreateShareLink,
  ShareLink,
  ShareLinkDetail,
  ShareLinkSummary,
  SharedCellar,
  SharedVintage,
} from "@cellarboss/types";
import type { Database } from "@schema/database.js";
import { db } from "@utils/database.js";
import { insertReturning } from "@utils/query-helpers.js";
import {
  getPartyWines,
  getVintageWines,
  hashSecret,
} from "./parties.controller.js";

/**
 * Shared links: someone without an account gets timed, read-only access to
 * the stored bottles and can mark some to set aside. A marked bottle is
 * taken for every link until the host releases it or deletes the link;
 * bottle statuses never change.
 */

export class ShareError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 | 410 = 400,
  ) {
    super(message);
  }
}

function stateOf(row: { expiresAt: string; revokedAt: string | null }) {
  if (row.revokedAt) return "revoked" as const;
  return Date.parse(row.expiresAt) <= Date.now()
    ? ("expired" as const)
    : ("active" as const);
}

function toLink(row: Selectable<Database["shareLink"]>): ShareLink {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    token: row.token,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    maxMarks: row.maxMarks === null ? null : Number(row.maxMarks),
    createdAt: row.createdAt,
    state: stateOf(row),
  };
}

async function requireLink(id: number) {
  const row = await db
    .selectFrom("shareLink")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) throw new ShareError("Link not found", 404);
  return row;
}

/** "DomaineE301 › 12" for each storage, walking up the parent chain. */
async function storagePaths(): Promise<Map<number, string>> {
  const storages = await db
    .selectFrom("storage")
    .select(["id", "name", "parent"])
    .execute();
  const byId = new Map(storages.map((s) => [s.id, s]));
  const paths = new Map<number, string>();
  for (const s of storages) {
    const names: string[] = [];
    const seen = new Set<number>();
    let current: (typeof storages)[number] | undefined = s;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      current = current.parent === null ? undefined : byId.get(current.parent);
    }
    paths.set(s.id, names.join(" › "));
  }
  return paths;
}

// --- host --------------------------------------------------------------------

export async function create(
  data: CreateShareLink,
  userId: string,
): Promise<ShareLinkDetail> {
  if (Date.parse(data.expiresAt) <= Date.now())
    throw new ShareError("The expiry must be in the future", 400);
  const row = await insertReturning(db, "shareLink", {
    title: data.title,
    message: data.message ?? "",
    token: randomBytes(24).toString("base64url"),
    expiresAt: new Date(data.expiresAt).toISOString(),
    revokedAt: null,
    maxMarks: data.maxMarks ?? null,
    createdBy: userId,
    createdAt: new Date().toISOString(),
  });
  return getDetail(row.id);
}

export async function list(): Promise<ShareLinkSummary[]> {
  const links = await db
    .selectFrom("shareLink")
    .selectAll()
    .orderBy("createdAt", "desc")
    .execute();
  const count = async (table: "shareGuest" | "shareMark") =>
    new Map(
      (
        await db
          .selectFrom(table)
          .select((eb) => ["linkId", eb.fn.countAll().as("n")])
          .groupBy("linkId")
          .execute()
      ).map((r) => [Number(r.linkId), Number(r.n)]),
    );
  const [guests, marks] = await Promise.all([
    count("shareGuest"),
    count("shareMark"),
  ]);
  return links.map((row) => ({
    ...toLink(row),
    guestCount: guests.get(row.id) ?? 0,
    markCount: marks.get(row.id) ?? 0,
  }));
}

export async function getDetail(id: number): Promise<ShareLinkDetail> {
  const link = toLink(await requireLink(id));
  const guests = await db
    .selectFrom("shareGuest")
    .select(["id", "name"])
    .where("linkId", "=", id)
    .orderBy("id")
    .execute();
  const marks = await db
    .selectFrom("shareMark")
    .innerJoin("bottle", "bottle.id", "shareMark.bottleId")
    .select([
      "shareMark.id as id",
      "shareMark.guestId as guestId",
      "shareMark.bottleId as bottleId",
      "shareMark.createdAt as createdAt",
      "bottle.vintageId as vintageId",
      "bottle.storageId as storageId",
      "bottle.status as status",
    ])
    .where("shareMark.linkId", "=", id)
    .execute();
  const wineOf = await getPartyWines(marks);
  const paths = await storagePaths();
  const guestName = new Map(guests.map((g) => [g.id, g.name]));
  return {
    ...link,
    guests: guests.map((g) => ({
      ...g,
      markCount: marks.filter((m) => m.guestId === g.id).length,
    })),
    // The pull list: sorted by where the bottles are.
    marks: marks
      .map((m) => ({
        id: m.id,
        guestId: m.guestId,
        guest: guestName.get(m.guestId) ?? "?",
        bottleId: m.bottleId,
        createdAt: m.createdAt,
        wine: wineOf(m),
        storagePath:
          m.storageId === null ? null : (paths.get(m.storageId) ?? null),
        stillStored: m.status === "stored",
      }))
      .sort(
        (a, b) =>
          (a.storagePath ?? "~").localeCompare(
            b.storagePath ?? "~",
            undefined,
            {
              numeric: true,
            },
          ) || a.wine.wineName.localeCompare(b.wine.wineName),
      ),
  };
}

export async function revoke(id: number): Promise<ShareLinkDetail> {
  await requireLink(id);
  await db
    .updateTable("shareLink")
    .set({ revokedAt: new Date().toISOString() })
    .where("id", "=", id)
    .where("revokedAt", "is", null)
    .execute();
  return getDetail(id);
}

/** A new expiry; also reopens a revoked link. */
export async function extend(
  id: number,
  expiresAt: string,
): Promise<ShareLinkDetail> {
  await requireLink(id);
  if (Date.parse(expiresAt) <= Date.now())
    throw new ShareError("The expiry must be in the future", 400);
  await db
    .updateTable("shareLink")
    .set({ expiresAt: new Date(expiresAt).toISOString(), revokedAt: null })
    .where("id", "=", id)
    .execute();
  return getDetail(id);
}

/** Deletes the link; its guests and marks go with it. */
export async function remove(id: number): Promise<void> {
  await requireLink(id);
  await db.deleteFrom("shareLink").where("id", "=", id).execute();
}

/** Releases one set-aside bottle. */
export async function releaseMark(
  id: number,
  markId: number,
): Promise<ShareLinkDetail> {
  const result = await db
    .deleteFrom("shareMark")
    .where("id", "=", markId)
    .where("linkId", "=", id)
    .executeTakeFirst();
  if (Number(result.numDeletedRows) === 0)
    throw new ShareError("Mark not found", 404);
  return getDetail(id);
}

/** Links that set this bottle aside (normally one), for the bottle page. */
export async function marksForBottle(
  bottleId: number,
): Promise<BottleShareMark[]> {
  return db
    .selectFrom("shareMark")
    .innerJoin("shareLink", "shareLink.id", "shareMark.linkId")
    .innerJoin("shareGuest", "shareGuest.id", "shareMark.guestId")
    .select([
      "shareLink.id as linkId",
      "shareLink.title as linkTitle",
      "shareGuest.name as guest",
    ])
    .where("shareMark.bottleId", "=", bottleId)
    .execute();
}

// --- people with the link (public, by token) ---------------------------------

async function activeByToken(token: string) {
  const row = await db
    .selectFrom("shareLink")
    .selectAll()
    .where("token", "=", token)
    .executeTakeFirst();
  if (!row) throw new ShareError("Link not found", 404);
  const state = stateOf(row);
  if (state !== "active")
    throw new ShareError(
      state === "revoked"
        ? "This link has been closed"
        : "This link has expired",
      410,
    );
  return row;
}

async function guestFor(linkId: number, secret: string | undefined) {
  if (!secret) throw new ShareError("Enter your name first", 403);
  const guest = await db
    .selectFrom("shareGuest")
    .select(["id", "name"])
    .where("linkId", "=", linkId)
    .where("secretHash", "=", hashSecret(secret))
    .executeTakeFirst();
  if (!guest) throw new ShareError("Enter your name first", 403);
  return guest;
}

export async function join(token: string, name: string) {
  const link = await activeByToken(token);
  const guests = await db
    .selectFrom("shareGuest")
    .select((eb) => eb.fn.countAll().as("n"))
    .where("linkId", "=", link.id)
    .executeTakeFirstOrThrow();
  if (Number(guests.n) >= 50)
    throw new ShareError("Too many people on this link", 409);
  const secret = randomBytes(24).toString("base64url");
  const guest = await insertReturning(db, "shareGuest", {
    linkId: link.id,
    name,
    secretHash: hashSecret(secret),
    createdAt: new Date().toISOString(),
  });
  return { name: guest.name, secret };
}

/** The stored cellar as the link shows it: by vintage, no prices. */
export async function sharedCellar(
  token: string,
  secret: string | undefined,
): Promise<SharedCellar> {
  const link = await activeByToken(token);
  const viewer = secret
    ? await db
        .selectFrom("shareGuest")
        .select(["id", "name"])
        .where("linkId", "=", link.id)
        .where("secretHash", "=", hashSecret(secret))
        .executeTakeFirst()
    : undefined;

  const bottles = await db
    .selectFrom("bottle")
    .select(["id", "vintageId", "storageId"])
    .where("status", "=", "stored")
    .execute();
  const marks = await db
    .selectFrom("shareMark")
    .innerJoin("shareGuest", "shareGuest.id", "shareMark.guestId")
    .select([
      "shareMark.id as id",
      "shareMark.bottleId as bottleId",
      "shareMark.linkId as linkId",
      "shareMark.guestId as guestId",
      "shareGuest.name as name",
    ])
    .execute();
  const markByBottle = new Map(marks.map((m) => [m.bottleId, m]));

  const vintageIds = [...new Set(bottles.map((b) => b.vintageId))];
  const wines = await getVintageWines(vintageIds);
  const windows = new Map(
    (vintageIds.length
      ? await db
          .selectFrom("vintage")
          .select(["id", "drinkFrom", "drinkUntil"])
          .where("id", "in", vintageIds)
          .execute()
      : []
    ).map((v) => [v.id, v]),
  );
  const notes = vintageIds.length
    ? await db
        .selectFrom("tastingNote")
        .select(["vintageId", "date", "score", "notes"])
        .where("vintageId", "in", vintageIds)
        .orderBy("date", "desc")
        .execute()
    : [];
  const paths = await storagePaths();

  const vintages: SharedVintage[] = [];
  for (const vintageId of vintageIds) {
    const wine = wines.get(vintageId);
    if (!wine) continue;
    const here = bottles.filter((b) => b.vintageId === vintageId);
    const mine: number[] = [];
    const taken = new Map<string, number>();
    let available = 0;
    for (const b of here) {
      const mark = markByBottle.get(b.id);
      if (!mark) available++;
      else if (viewer && mark.guestId === viewer.id) mine.push(mark.id);
      else {
        // Other people on this link by name; other links just "set aside".
        const key = mark.linkId === link.id ? mark.name : "";
        taken.set(key, (taken.get(key) ?? 0) + 1);
      }
    }
    const window = windows.get(vintageId);
    vintages.push({
      vintageId,
      wine,
      drinkFrom: window?.drinkFrom ?? null,
      drinkUntil: window?.drinkUntil ?? null,
      available,
      mine,
      taken: [...taken].map(([name, count]) => ({ name: name || null, count })),
      storagePaths: [
        ...new Set(
          here
            .map((b) => (b.storageId === null ? null : paths.get(b.storageId)))
            .filter((p): p is string => !!p),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      notes: notes
        .filter((n) => n.vintageId === vintageId)
        .map((n) => ({ date: n.date, score: Number(n.score), notes: n.notes })),
    });
  }
  vintages.sort(
    (a, b) =>
      a.wine.winemaker.localeCompare(b.wine.winemaker) ||
      a.wine.wineName.localeCompare(b.wine.wineName) ||
      (a.wine.year ?? 0) - (b.wine.year ?? 0),
  );

  return {
    title: link.title,
    message: link.message,
    expiresAt: link.expiresAt,
    maxMarks: link.maxMarks === null ? null : Number(link.maxMarks),
    myMarks: viewer
      ? marks.filter((m) => m.guestId === viewer.id).length
      : null,
    viewerName: viewer?.name ?? null,
    vintages,
  };
}

/** Sets aside one unmarked stored bottle of a vintage for the viewer. */
export async function mark(
  token: string,
  secret: string | undefined,
  vintageId: number,
): Promise<void> {
  const link = await activeByToken(token);
  const guest = await guestFor(link.id, secret);
  await db.transaction().execute(async (trx) => {
    if (link.maxMarks !== null) {
      const used = await trx
        .selectFrom("shareMark")
        .select((eb) => eb.fn.countAll().as("n"))
        .where("guestId", "=", guest.id)
        .executeTakeFirstOrThrow();
      if (Number(used.n) >= Number(link.maxMarks))
        throw new ShareError(
          `You can mark up to ${link.maxMarks} ${Number(link.maxMarks) === 1 ? "bottle" : "bottles"}`,
          409,
        );
    }
    const free = await trx
      .selectFrom("bottle")
      .leftJoin("shareMark", "shareMark.bottleId", "bottle.id")
      .select("bottle.id as id")
      .where("bottle.vintageId", "=", vintageId)
      .where("bottle.status", "=", "stored")
      .where("shareMark.id", "is", null)
      .orderBy("bottle.id")
      .executeTakeFirst();
    if (!free)
      throw new ShareError("No bottles of this wine are left to mark", 409);
    await insertReturning(trx, "shareMark", {
      linkId: link.id,
      guestId: guest.id,
      bottleId: free.id,
      createdAt: new Date().toISOString(),
    });
  });
}

/** Removes one of the viewer's own marks. */
export async function unmark(
  token: string,
  secret: string | undefined,
  markId: number,
): Promise<void> {
  const link = await activeByToken(token);
  const guest = await guestFor(link.id, secret);
  const result = await db
    .deleteFrom("shareMark")
    .where("id", "=", markId)
    .where("guestId", "=", guest.id)
    .executeTakeFirst();
  if (Number(result.numDeletedRows) === 0)
    throw new ShareError("Mark not found", 404);
}
