import { NoResultError } from "kysely";
import { db } from "@utils/database.js";
import {
  insertReturning,
  updateReturning,
  toNumber,
} from "@utils/query-helpers.js";
import type { Bottle, CreateBottle, UpdateBottle } from "@cellarboss/types";
import {
  requireStorage,
  storageOrPersonal,
  visibleStorageIds,
} from "@utils/access.js";

// node-pg and mysql2 return DECIMAL columns as strings; coerce to number
function toBottle<T extends { purchasePrice: number | string }>(
  row: T,
): T & { purchasePrice: number } {
  return { ...row, purchasePrice: toNumber(row.purchasePrice) };
}

// Every read is limited to bottles in storages the signed-in user can see.
export async function list(): Promise<Bottle[]> {
  const ids = await visibleStorageIds();
  let query = db.selectFrom("bottle").selectAll();
  if (ids) query = query.where("storageId", "in", ids);
  return (await query.execute()).map(toBottle);
}

export async function getById(id: number): Promise<Bottle | undefined> {
  const ids = await visibleStorageIds();
  let query = db.selectFrom("bottle").selectAll().where("id", "=", id);
  if (ids) query = query.where("storageId", "in", ids);
  const row = await query.executeTakeFirst();
  return row ? toBottle(row) : undefined;
}

export async function getByVintageId(vintageId: number): Promise<Bottle[]> {
  const ids = await visibleStorageIds();
  let query = db
    .selectFrom("bottle")
    .where("vintageId", "=", vintageId)
    .selectAll();
  if (ids) query = query.where("storageId", "in", ids);
  return (await query.execute()).map(toBottle);
}

export async function getCountsByVintageId(vintageId: number) {
  const ids = await visibleStorageIds();
  let query = db
    .selectFrom("bottle")
    .select((eb) => ["status", eb.fn.count("id").as("count")])
    .where("vintageId", "=", vintageId)
    .groupBy("status");
  if (ids) query = query.where("storageId", "in", ids);
  const rows = await query.execute();
  // COUNT() is returned as a string on Postgres
  return rows.map((row) => ({ status: row.status, count: Number(row.count) }));
}

/** The storage a bottle is in now, after checking the user can change it. */
async function requireEditable(id: number): Promise<void> {
  const current = await db
    .selectFrom("bottle")
    .select("storageId")
    .where("id", "=", id)
    .executeTakeFirst();
  if (!current) throw new NoResultError({} as never);
  await requireStorage(current.storageId, "edit");
}

// A bottle with no storage goes into the user's personal "unsorted" storage.
export async function create(data: CreateBottle): Promise<Bottle> {
  const storageId = await storageOrPersonal(data.storageId);
  await requireStorage(storageId, "edit");
  const row = await insertReturning(db, "bottle", { ...data, storageId });
  return toBottle(row);
}

export async function update(id: number, data: UpdateBottle): Promise<Bottle> {
  await requireEditable(id);
  let changes = data;
  if ("storageId" in data) {
    // Moving needs edit on the destination too.
    const storageId = await storageOrPersonal(data.storageId);
    await requireStorage(storageId, "edit");
    changes = { ...data, storageId };
  }
  const row = await updateReturning(db, "bottle", id, changes);
  return toBottle(row);
}

export async function remove(id: number) {
  await requireEditable(id);
  return await db
    .deleteFrom("bottle")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
