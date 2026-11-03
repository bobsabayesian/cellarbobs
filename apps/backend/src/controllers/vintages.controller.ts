import { db } from "@utils/database.js";
import {
  adoptHidden,
  catalogIds,
  markSeen,
  requireCatalog,
} from "@utils/catalog-access.js";
import { insertReturning, updateReturning } from "@utils/query-helpers.js";
import {
  bottleCountsByVintageIds,
  emptyBottleCounts,
  tastingNoteCountsByVintageIds,
} from "@utils/aggregates.js";
import type {
  CreateVintage,
  UpdateVintage,
  Vintage,
  VintageDetail,
} from "@cellarboss/types";

export async function list(): Promise<VintageDetail[]> {
  const ids = await catalogIds("vintage");
  let query = db.selectFrom("vintage").selectAll();
  if (ids) query = query.where("id", "in", ids);
  // Counts are scoped to what the user can see, so count across the table
  return withCounts(await query.execute(), undefined);
}

export async function getByWineId(wineId: number): Promise<VintageDetail[]> {
  const ids = await catalogIds("vintage");
  let query = db.selectFrom("vintage").selectAll().where("wineId", "=", wineId);
  if (ids) query = query.where("id", "in", ids);
  const rows = await query.execute();
  return withCounts(
    rows,
    rows.map((r) => r.id),
  );
}

export async function getById(id: number): Promise<VintageDetail | undefined> {
  const ids = await catalogIds("vintage");
  let query = db.selectFrom("vintage").selectAll().where("id", "=", id);
  if (ids) query = query.where("id", "in", ids);
  const row = await query.executeTakeFirst();
  if (!row) return undefined;
  const [detail] = await withCounts([row], [id]);
  return detail;
}

async function withCounts(
  rows: Vintage[],
  vintageIds: number[] | undefined,
): Promise<VintageDetail[]> {
  if (rows.length === 0) return [];
  const [bottleCounts, noteCounts] = await Promise.all([
    bottleCountsByVintageIds(vintageIds),
    tastingNoteCountsByVintageIds(vintageIds),
  ]);
  return rows.map((row) => ({
    ...row,
    tastingNotesCount: noteCounts.get(row.id) ?? 0,
    bottles: bottleCounts.get(row.id) ?? emptyBottleCounts(),
  }));
}

export async function create(data: CreateVintage) {
  // Re-adding a vintage that exists but is hidden from you reuses it.
  let existing = db
    .selectFrom("vintage")
    .selectAll()
    .where("wineId", "=", data.wineId);
  existing =
    data.year === null
      ? existing.where("year", "is", null)
      : existing.where("year", "=", data.year);
  const hidden = await adoptHidden(
    "vintage",
    await existing.executeTakeFirst(),
  );
  if (hidden) return hidden;
  const created = await insertReturning(db, "vintage", data);
  await markSeen("vintage", created.id);
  return created;
}

export async function update(id: number, data: UpdateVintage) {
  await requireCatalog("vintage", id);
  return await updateReturning(db, "vintage", id, data);
}

export async function remove(id: number) {
  await requireCatalog("vintage", id);
  return await db
    .deleteFrom("vintage")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
