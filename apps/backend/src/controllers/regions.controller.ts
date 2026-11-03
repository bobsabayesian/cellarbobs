import { db } from "@utils/database.js";
import { insertReturning, updateReturning } from "@utils/query-helpers.js";
import {
  adoptHidden,
  catalogIds,
  markSeen,
  requireCatalog,
} from "@utils/catalog-access.js";
import type { CreateRegion, UpdateRegion } from "@cellarboss/types";

// Only records the signed-in user can see (see catalog-access).
export async function list() {
  const ids = await catalogIds("region");
  let query = db.selectFrom("region").selectAll();
  if (ids) query = query.where("id", "in", ids);
  return await query.execute();
}

export async function getById(id: number) {
  const ids = await catalogIds("region");
  let query = db.selectFrom("region").selectAll().where("id", "=", id);
  if (ids) query = query.where("id", "in", ids);
  return await query.executeTakeFirst();
}

export async function create(data: CreateRegion) {
  // Re-adding something that exists but is hidden from you reuses it.
  const hidden = await adoptHidden(
    "region",
    await db
      .selectFrom("region")
      .selectAll()
      .where("name", "=", data.name)
      .where("countryId", "=", data.countryId)
      .executeTakeFirst(),
  );
  if (hidden) return hidden;
  const created = await insertReturning(db, "region", data);
  await markSeen("region", created.id);
  return created;
}

export async function update(id: number, data: UpdateRegion) {
  await requireCatalog("region", id);
  return await updateReturning(db, "region", id, data);
}

export async function remove(id: number) {
  await requireCatalog("region", id);
  return await db
    .deleteFrom("region")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
