import { db } from "@utils/database.js";
import { insertReturning, updateReturning } from "@utils/query-helpers.js";
import type { CreateStorage, UpdateStorage } from "@cellarboss/types";
import {
  grantCreator,
  requireStorage,
  visibleStorageIds,
} from "@utils/access.js";

// Only storages the signed-in user can see; personal storages of other users
// are hidden from them (the admin sees all).
export async function list() {
  const ids = await visibleStorageIds();
  let query = db.selectFrom("storage").selectAll();
  if (ids) query = query.where("id", "in", ids);
  return await query.execute();
}

export async function getById(id: number) {
  const ids = await visibleStorageIds();
  let query = db.selectFrom("storage").selectAll().where("id", "=", id);
  if (ids) query = query.where("id", "in", ids);
  return await query.executeTakeFirst();
}

export async function create(data: CreateStorage) {
  // Inside someone else's storage needs edit there; a new top-level storage
  // is yours alone until the admin shares it.
  if (data.parent !== null && data.parent !== undefined)
    await requireStorage(data.parent, "edit");
  const created = await insertReturning(db, "storage", data);
  await grantCreator(created.id);
  return created;
}

export async function update(id: number, data: UpdateStorage) {
  await requireStorage(id, "edit");
  if (data.parent !== null && data.parent !== undefined)
    await requireStorage(data.parent, "edit");
  return await updateReturning(db, "storage", id, data);
}

export async function remove(id: number) {
  await requireStorage(id, "edit");
  return await db
    .deleteFrom("storage")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
