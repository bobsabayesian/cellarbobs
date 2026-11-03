import { db } from "@utils/database.js";
import { insertReturning, updateReturning } from "@utils/query-helpers.js";
import { tastingNoteCountsByWineIds } from "@utils/aggregates.js";
import {
  adoptHidden,
  catalogIds,
  markSeen,
  requireCatalog,
} from "@utils/catalog-access.js";
import type {
  CreateWine,
  UpdateWine,
  Wine,
  WineDetail,
} from "@cellarboss/types";

export async function list(): Promise<WineDetail[]> {
  const ids = await catalogIds("wine");
  let query = db.selectFrom("wine").selectAll();
  if (ids) query = query.where("id", "in", ids);
  const [rows, noteCounts] = await Promise.all([
    query.execute(),
    tastingNoteCountsByWineIds(),
  ]);
  return rows.map((row) => toDetail(row, noteCounts));
}

export async function getById(id: number): Promise<WineDetail | undefined> {
  const ids = await catalogIds("wine");
  let query = db.selectFrom("wine").selectAll().where("id", "=", id);
  if (ids) query = query.where("id", "in", ids);
  const row = await query.executeTakeFirst();
  if (!row) return undefined;
  return toDetail(row, await tastingNoteCountsByWineIds([id]));
}

function toDetail(row: Wine, noteCounts: Map<number, number>): WineDetail {
  return { ...row, tastingNotesCount: noteCounts.get(row.id) ?? 0 };
}

export async function create(data: CreateWine) {
  // Re-adding a wine that exists but is hidden from you reuses it.
  const hidden = await adoptHidden(
    "wine",
    await db
      .selectFrom("wine")
      .selectAll()
      .where("name", "=", data.name)
      .where("wineMakerId", "=", data.wineMakerId)
      .executeTakeFirst(),
  );
  if (hidden) return hidden;
  const created = await insertReturning(db, "wine", data);
  await markSeen("wine", created.id);
  return created;
}

export async function update(id: number, data: UpdateWine) {
  await requireCatalog("wine", id);
  return await updateReturning(db, "wine", id, data);
}

export async function remove(id: number) {
  await requireCatalog("wine", id);
  return await db.transaction().execute(async (trx) => {
    const vintages = await trx
      .selectFrom("vintage")
      .where("wineId", "=", id)
      .select("id")
      .execute();

    if (vintages.length > 0) {
      throw new Error("Cannot delete wine: it still has vintages associated");
    }

    await trx.deleteFrom("winegrape").where("wineId", "=", id).execute();

    return await trx
      .deleteFrom("wine")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  });
}
