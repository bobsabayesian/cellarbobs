import type {
  AccessLevel,
  StorageAccessOverview,
  StorageGrant,
} from "@cellarboss/types";
import { db } from "@utils/database.js";
import { AccessError } from "@utils/access.js";

/** Everything the admin's access screen shows: users, storages and grants. */
export async function overview(): Promise<StorageAccessOverview> {
  const [users, storages, grants] = await Promise.all([
    db
      .selectFrom("user")
      .select(["id", "name", "email", "role"])
      .orderBy("name")
      .execute(),
    db
      .selectFrom("storage")
      .select(["id", "name", "parent", "locationId"])
      // Personal storages belong to their user; they aren't shared here.
      .where("personalFor", "is", null)
      .execute(),
    db
      .selectFrom("storageAccess")
      .innerJoin("storage", "storage.id", "storageAccess.storageId")
      .select([
        "storageAccess.storageId as storageId",
        "storageAccess.userId as userId",
        "storageAccess.level as level",
      ])
      .where("storage.personalFor", "is", null)
      .execute(),
  ]);
  return {
    users: users.map((u) => ({ ...u, role: u.role ?? "user" })),
    storages,
    grants: grants as StorageGrant[],
  };
}

/** Sets a user's access to a storage; a null level removes it. */
export async function setGrant(
  storageId: number,
  userId: string,
  level: AccessLevel | null,
): Promise<void> {
  const storage = await db
    .selectFrom("storage")
    .select(["id", "personalFor"])
    .where("id", "=", storageId)
    .executeTakeFirst();
  if (!storage) throw new AccessError("Storage not found", 404);
  if (storage.personalFor)
    throw new AccessError("A personal storage can't be shared", 403);
  const user = await db
    .selectFrom("user")
    .select("id")
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!user) throw new AccessError("User not found", 404);

  if (level === null) {
    await db
      .deleteFrom("storageAccess")
      .where("storageId", "=", storageId)
      .where("userId", "=", userId)
      .execute();
    return;
  }
  const existing = await db
    .selectFrom("storageAccess")
    .select("id")
    .where("storageId", "=", storageId)
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (existing)
    await db
      .updateTable("storageAccess")
      .set({ level })
      .where("id", "=", existing.id)
      .execute();
  else
    await db
      .insertInto("storageAccess")
      .values({
        storageId,
        userId,
        level,
        createdAt: new Date().toISOString(),
      })
      .execute();
}
