import { db } from "@utils/database.js";
import { insertReturning, updateReturning } from "@utils/query-helpers.js";
import type { CreateLocation, UpdateLocation } from "@cellarboss/types";
import {
  AccessError,
  currentViewer,
  visibleStorageIds,
} from "@utils/access.js";

/**
 * A location shows up for a user who can see a storage in it, or who added
 * it. The admin sees all.
 */
async function visibleLocationQuery() {
  const ids = await visibleStorageIds();
  let query = db.selectFrom("location").selectAll();
  if (ids) {
    const viewer = currentViewer();
    query = query.where((eb) =>
      eb.or([
        eb(
          "id",
          "in",
          eb.selectFrom("storage").select("locationId").where("id", "in", ids),
        ),
        eb("createdBy", "=", viewer?.id ?? ""),
      ]),
    );
  }
  return query;
}

export async function list() {
  return await (await visibleLocationQuery()).execute();
}

export async function getById(id: number) {
  return await (
    await visibleLocationQuery()
  )
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function create(data: CreateLocation) {
  return await insertReturning(db, "location", {
    ...data,
    createdBy: currentViewer()?.id ?? null,
  });
}

/** Changing or deleting a location needs it to be visible to you. */
async function requireVisible(id: number) {
  if (!(await getById(id))) throw new AccessError("Not found", 404);
}

export async function update(id: number, data: UpdateLocation) {
  await requireVisible(id);
  return await updateReturning(db, "location", id, data);
}

export async function remove(id: number) {
  await requireVisible(id);
  return await db
    .deleteFrom("location")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
