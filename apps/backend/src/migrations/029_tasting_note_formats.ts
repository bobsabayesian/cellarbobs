import type { UntypedKysely } from "@schema/untyped.js";
import { longText, shortText } from "@utils/migration-helpers.js";

/**
 * Tasting notes can be written in one of the party tasting formats.
 *
 *   tastingNote.format   "quick" (score and text only), "beginner" or
 *                        "advanced"; null for notes from before formats
 *   tastingNote.answers  JSON of the format's answers, keyed by field
 */
export async function up(db: UntypedKysely): Promise<void> {
  await db.schema
    .alterTable("tastingNote")
    .addColumn("format", shortText())
    .execute();
  await db.schema
    .alterTable("tastingNote")
    .addColumn("answers", longText())
    .execute();
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.schema.alterTable("tastingNote").dropColumn("answers").execute();
  await db.schema.alterTable("tastingNote").dropColumn("format").execute();
}
