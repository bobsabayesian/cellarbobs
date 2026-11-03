import { db } from "@utils/database.js";
import { insertReturning, updateReturning } from "@utils/query-helpers.js";
import {
  adoptHidden,
  catalogIds,
  markSeen,
  requireCatalog,
} from "@utils/catalog-access.js";
import type { CreateGrape, UpdateGrape } from "@cellarboss/types";

// Only records the signed-in user can see (see catalog-access).
export async function list() {
  const ids = await catalogIds("grape");
  let query = db.selectFrom("grape").selectAll();
  if (ids) query = query.where("id", "in", ids);
  return await query.execute();
}

export async function getById(id: number) {
  const ids = await catalogIds("grape");
  let query = db.selectFrom("grape").selectAll().where("id", "=", id);
  if (ids) query = query.where("id", "in", ids);
  return await query.executeTakeFirst();
}

export async function create(data: CreateGrape) {
  // Re-adding something that exists but is hidden from you reuses it.
  const hidden = await adoptHidden(
    "grape",
    await db
      .selectFrom("grape")
      .selectAll()
      .where("name", "=", data.name)
      .executeTakeFirst(),
  );
  if (hidden) return hidden;
  const created = await insertReturning(db, "grape", data);
  await markSeen("grape", created.id);
  return created;
}

export async function update(id: number, data: UpdateGrape) {
  await requireCatalog("grape", id);
  return await updateReturning(db, "grape", id, data);
}

export async function remove(id: number) {
  await requireCatalog("grape", id);
  return await db
    .deleteFrom("grape")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
