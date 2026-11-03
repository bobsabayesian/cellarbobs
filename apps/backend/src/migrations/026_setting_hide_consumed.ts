import type { UntypedKysely } from "@schema/untyped.js";

/**
 * "hideConsumed": drunk, sold and gifted bottles are left out of everyday
 * views unless a view is asked to include them. On by default; an admin can
 * turn it off in Application Settings.
 */
export async function up(db: UntypedKysely): Promise<void> {
  const existing = await db
    .selectFrom("setting")
    .select("key")
    .where("key", "=", "hideConsumed")
    .executeTakeFirst();
  if (!existing)
    await db
      .insertInto("setting")
      .values({ key: "hideConsumed", value: "true" })
      .execute();
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.deleteFrom("setting").where("key", "=", "hideConsumed").execute();
}
