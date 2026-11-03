import { db } from "@utils/database.js";
import { insertReturning, updateReturning } from "@utils/query-helpers.js";
import {
  adoptHidden,
  catalogIds,
  markSeen,
  requireCatalog,
} from "@utils/catalog-access.js";
import type { CreateWineMaker, UpdateWineMaker } from "@cellarboss/types";

// Only records the signed-in user can see (see catalog-access).
export async function list() {
  const ids = await catalogIds("winemaker");
  let query = db.selectFrom("winemaker").selectAll();
  if (ids) query = query.where("id", "in", ids);
  return await query.execute();
}

export async function getById(id: number) {
  const ids = await catalogIds("winemaker");
  let query = db.selectFrom("winemaker").selectAll().where("id", "=", id);
  if (ids) query = query.where("id", "in", ids);
  return await query.executeTakeFirst();
}

export async function create(data: CreateWineMaker) {
  // Re-adding something that exists but is hidden from you reuses it.
  const hidden = await adoptHidden(
    "winemaker",
    await db
      .selectFrom("winemaker")
      .selectAll()
      .where("name", "=", data.name)
      .executeTakeFirst(),
  );
  if (hidden) return hidden;
  const created = await insertReturning(db, "winemaker", data);
  await markSeen("winemaker", created.id);
  return created;
}

export async function update(id: number, data: UpdateWineMaker) {
  await requireCatalog("winemaker", id);
  return await updateReturning(db, "winemaker", id, data);
}

export async function remove(id: number) {
  await requireCatalog("winemaker", id);
  return await db
    .deleteFrom("winemaker")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
