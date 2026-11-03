import type { UntypedKysely } from "@schema/untyped.js";
import { addIdColumn, shortText } from "@utils/migration-helpers.js";

/**
 * Which catalog records a user has added or picked up themselves.
 *
 * The catalog (wines, vintages, winemakers, grapes, regions, countries) is
 * one shared set, but a user only sees records that come from bottles they
 * can see, notes they wrote, or records they created. A row here covers the
 * last two cases for a wine or vintage with no bottle yet, and a duplicate
 * someone re-added that already existed.
 *
 *   kind  vintage | wine | winemaker | grape | region | country
 */
export async function up(db: UntypedKysely): Promise<void> {
  await addIdColumn(db.schema.createTable("catalogSeen"))
    .addColumn("kind", shortText(), (col) => col.notNull())
    .addColumn("recordId", "integer", (col) => col.notNull())
    .addColumn("userId", shortText(), (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addUniqueConstraint("uq_catalogSeen", ["kind", "recordId", "userId"])
    .execute();
  await db.schema
    .createIndex("idx_catalogSeen_userId")
    .on("catalogSeen")
    .column("userId")
    .execute();
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.schema.dropTable("catalogSeen").execute();
}
