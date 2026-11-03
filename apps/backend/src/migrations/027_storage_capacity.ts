import type { UntypedKysely } from "@schema/untyped.js";

/**
 * How many bottles a storage holds (one bottle is one slot, whatever its
 * size). Null means not set; a parent without one shows the sum of its
 * children's.
 */
export async function up(db: UntypedKysely): Promise<void> {
  await db.schema
    .alterTable("storage")
    .addColumn("capacity", "integer")
    .execute();
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.schema.alterTable("storage").dropColumn("capacity").execute();
}
