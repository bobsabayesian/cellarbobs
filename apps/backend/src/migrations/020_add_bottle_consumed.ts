import type { UntypedKysely } from "@schema/untyped.js";
import { longText, shortText } from "@utils/migration-helpers.js";

/**
 * Records when a bottle left the cellar and why, alongside its status.
 * Both are nullable: bottles still in the cellar have neither, and history
 * imported from other apps often has a date but no note (or vice versa).
 *
 * consumedDate is an ISO date string in shortText, matching purchaseDate.
 */
export async function up(db: UntypedKysely): Promise<void> {
  await db.schema
    .alterTable("bottle")
    .addColumn("consumedDate", shortText())
    .execute();
  await db.schema
    .alterTable("bottle")
    .addColumn("consumedNote", longText())
    .execute();
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.schema.alterTable("bottle").dropColumn("consumedNote").execute();
  await db.schema.alterTable("bottle").dropColumn("consumedDate").execute();
}
