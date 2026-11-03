import { db } from "@utils/database.js";
import { insertReturning, updateReturning } from "@utils/query-helpers.js";
import {
  adoptHidden,
  catalogIds,
  markSeen,
  requireCatalog,
} from "@utils/catalog-access.js";
import type { CreateCountry, UpdateCountry } from "@cellarboss/types";

// Only records the signed-in user can see (see catalog-access).
export async function list() {
  const ids = await catalogIds("country");
  let query = db.selectFrom("country").selectAll();
  if (ids) query = query.where("id", "in", ids);
  return await query.execute();
}

export async function getById(id: number) {
  const ids = await catalogIds("country");
  let query = db.selectFrom("country").selectAll().where("id", "=", id);
  if (ids) query = query.where("id", "in", ids);
  return await query.executeTakeFirst();
}

export async function create(data: CreateCountry) {
  // Re-adding something that exists but is hidden from you reuses it.
  const hidden = await adoptHidden(
    "country",
    await db
      .selectFrom("country")
      .selectAll()
      .where("name", "=", data.name)
      .executeTakeFirst(),
  );
  if (hidden) return hidden;
  const created = await insertReturning(db, "country", data);
  await markSeen("country", created.id);
  return created;
}

export async function update(id: number, data: UpdateCountry) {
  await requireCatalog("country", id);
  return await updateReturning(db, "country", id, data);
}

export async function remove(id: number) {
  await requireCatalog("country", id);
  return await db
    .deleteFrom("country")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
