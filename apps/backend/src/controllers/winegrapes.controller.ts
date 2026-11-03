import { db } from "@utils/database.js";
import { catalogIds } from "@utils/catalog-access.js";
import { insertReturning, updateReturning } from "@utils/query-helpers.js";
import type { CreateWineGrape, UpdateWineGrape } from "@cellarboss/types";

// Grape links of wines the user can see.
async function scoped() {
  const ids = await catalogIds("wine");
  const query = db.selectFrom("winegrape").selectAll();
  return ids ? query.where("wineId", "in", ids) : query;
}

export async function list() {
  return await (await scoped()).execute();
}

export async function getById(id: number) {
  return await (await scoped()).where("id", "=", id).executeTakeFirst();
}

export async function getByWineId(wineId: number) {
  return await (await scoped()).where("wineId", "=", wineId).execute();
}

export async function create(data: CreateWineGrape) {
  return await insertReturning(db, "winegrape", data);
}

export async function update(id: number, data: UpdateWineGrape) {
  return await updateReturning(db, "winegrape", id, data);
}

export async function remove(id: number) {
  return await db
    .deleteFrom("winegrape")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
