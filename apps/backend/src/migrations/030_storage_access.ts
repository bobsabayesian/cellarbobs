import type { UntypedKysely } from "@schema/untyped.js";
import { addIdColumn, shortText } from "@utils/migration-helpers.js";

/**
 * Per-storage access for a shared family cellar.
 *
 *   storageAccess        who can see a storage and its sub-storages: level
 *                        "view" (read-only) or "edit"; one row per user
 *   storage.personalFor  a user's own "unsorted" storage, for bottles with no
 *                        real storage yet (pending, guest bottles). Set null
 *                        if the user is deleted, leaving it for the admin.
 *   location.createdBy   so a new location is visible to its creator before
 *                        any storage in it is
 *
 * The admin sees everything, so existing storages need no rows. Bottles that
 * have no storage move into the first admin's personal storage.
 */
export async function up(db: UntypedKysely): Promise<void> {
  await addIdColumn(db.schema.createTable("storageAccess"))
    .addColumn("storageId", "integer", (col) =>
      col.notNull().references("storage.id").onDelete("cascade"),
    )
    .addColumn("userId", shortText(), (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("level", shortText(), (col) => col.notNull())
    .addColumn("createdAt", shortText(), (col) => col.notNull())
    .addUniqueConstraint("uq_storageAccess_storage_user", [
      "storageId",
      "userId",
    ])
    .execute();
  await db.schema
    .createIndex("idx_storageAccess_userId")
    .on("storageAccess")
    .column("userId")
    .execute();

  await db.schema
    .alterTable("storage")
    .addColumn("personalFor", shortText(), (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .execute();
  await db.schema
    .alterTable("location")
    .addColumn("createdBy", shortText(), (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .execute();

  const admin = await db
    .selectFrom("user")
    .select(["id", "name"])
    .where("role", "=", "admin")
    .orderBy("createdAt")
    .executeTakeFirst();
  const loose = await db
    .selectFrom("bottle")
    .select("id")
    .where("storageId", "is", null)
    .limit(1)
    .executeTakeFirst();
  if (admin && loose) {
    const storage = await db
      .insertInto("storage")
      .values({
        name: `${admin.name} (unsorted)`,
        locationId: null,
        parent: null,
        personalFor: admin.id,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("storageAccess")
      .values({
        storageId: storage.id,
        userId: admin.id,
        level: "edit",
        createdAt: new Date().toISOString(),
      })
      .execute();
    await db
      .updateTable("bottle")
      .set({ storageId: storage.id })
      .where("storageId", "is", null)
      .execute();
  }
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.schema.alterTable("location").dropColumn("createdBy").execute();
  await db.schema.alterTable("storage").dropColumn("personalFor").execute();
  await db.schema.dropTable("storageAccess").execute();
}
