import type { Kysely, Transaction } from "kysely";
import type { Database } from "@schema/database.js";
import { db } from "./database.js";
import {
  AccessError,
  currentViewer,
  invalidateAccess,
  requestMemo,
  visibleStorageIds,
} from "./access.js";

/**
 * Which catalog records (wines, vintages, winemakers, grapes, regions,
 * countries) a user sees. The catalog is one shared set, but a user sees:
 *
 *   - vintages with a bottle in a storage they can see
 *   - vintages they wrote a tasting note on
 *   - records they created or re-added (catalogSeen)
 *
 * plus whatever those lead to: a visible vintage shows its wine, and a
 * visible wine shows its winemaker, region, country and grapes. So a record
 * nobody has a bottle of drops out of their views. The admin, and code with
 * no signed-in user, sees everything.
 */

export type CatalogKind =
  "vintage" | "wine" | "winemaker" | "grape" | "region" | "country";

type Catalog = Record<CatalogKind, Set<number>>;
type Conn = Kysely<Database> | Transaction<Database>;

async function compute(userId: string): Promise<Catalog> {
  const storages = await visibleStorageIds();
  const [bottles, notes, seen, wines, vintages, regions, winegrapes] =
    await Promise.all([
      db
        .selectFrom("bottle")
        .select("vintageId")
        .distinct()
        .where("storageId", "in", storages ?? [-1])
        .execute(),
      db
        .selectFrom("tastingNote")
        .select("vintageId")
        .distinct()
        .where("authorId", "=", userId)
        .execute(),
      db
        .selectFrom("catalogSeen")
        .select(["kind", "recordId"])
        .where("userId", "=", userId)
        .execute(),
      db.selectFrom("wine").select(["id", "wineMakerId", "regionId"]).execute(),
      db.selectFrom("vintage").select(["id", "wineId"]).execute(),
      db.selectFrom("region").select(["id", "countryId"]).execute(),
      db.selectFrom("winegrape").select(["wineId", "grapeId"]).execute(),
    ]);

  const result: Catalog = {
    vintage: new Set([
      ...bottles.map((b) => b.vintageId),
      ...notes.map((n) => n.vintageId),
    ]),
    wine: new Set(),
    winemaker: new Set(),
    grape: new Set(),
    region: new Set(),
    country: new Set(),
  };
  for (const s of seen) result[s.kind].add(s.recordId);

  const wineOfVintage = new Map(vintages.map((v) => [v.id, v.wineId]));
  for (const id of result.vintage) {
    const wineId = wineOfVintage.get(id);
    if (wineId !== undefined) result.wine.add(wineId);
  }
  for (const w of wines) {
    if (!result.wine.has(w.id)) continue;
    result.winemaker.add(w.wineMakerId);
    if (w.regionId !== null) result.region.add(w.regionId);
  }
  for (const g of winegrapes)
    if (result.wine.has(g.wineId)) result.grape.add(g.grapeId);
  for (const r of regions)
    if (result.region.has(r.id)) result.country.add(r.countryId);
  return result;
}

async function catalog(): Promise<Catalog | null> {
  const viewer = currentViewer();
  if (!viewer || viewer.isAdmin) return null;
  return requestMemo("catalog", () => compute(viewer.id));
}

/**
 * Ids of the records of a kind the user can see, or null for no restriction.
 * Never empty, so it can go straight into `where(..., "in", ids)`.
 */
export async function catalogIds(kind: CatalogKind): Promise<number[] | null> {
  const c = await catalog();
  if (!c) return null;
  return c[kind].size ? [...c[kind]] : [-1];
}

/** Throws not-found unless the user can see this record. */
export async function requireCatalog(kind: CatalogKind, id: number) {
  const c = await catalog();
  if (c && !c[kind].has(id)) throw new AccessError("Not found", 404);
}

/** Records that the signed-in user added (or picked up) this record. */
export async function markSeen(
  kind: CatalogKind,
  recordId: number,
  conn: Conn = db,
): Promise<void> {
  const viewer = currentViewer();
  if (!viewer || viewer.isAdmin) return;
  await conn
    .insertInto("catalogSeen")
    .values({ kind, recordId, userId: viewer.id })
    .onConflict((oc) => oc.columns(["kind", "recordId", "userId"]).doNothing())
    .execute();
  invalidateAccess();
}

/**
 * When someone re-adds something that already exists but is hidden from
 * them (say "Ridge"), they get the existing record instead of a duplicate.
 * Returns it, or undefined if there's nothing hidden to reuse.
 */
export async function adoptHidden<T extends { id: number }>(
  kind: CatalogKind,
  existing: T | undefined,
): Promise<T | undefined> {
  if (!existing) return undefined;
  const c = await catalog();
  if (!c || c[kind].has(existing.id)) return undefined;
  await markSeen(kind, existing.id);
  return existing;
}
