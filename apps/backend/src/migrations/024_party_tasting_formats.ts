import type { UntypedKysely } from "@schema/untyped.js";
import { longText, shortText } from "@utils/migration-helpers.js";

/**
 * Tasting formats for parties (beginner / advanced).
 *
 *   tastingParty.format   "beginner" | "advanced"; null for parties from
 *                         before formats, which keep their tags + 1-5
 *                         structure reviews as recorded
 *   partyReview.answers   JSON object of format answers by field key
 */
export async function up(db: UntypedKysely): Promise<void> {
  await db.schema
    .alterTable("tastingParty")
    .addColumn("format", shortText())
    .execute();
  await db.schema
    .alterTable("partyReview")
    .addColumn("answers", longText())
    .execute();
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.schema.alterTable("partyReview").dropColumn("answers").execute();
  await db.schema.alterTable("tastingParty").dropColumn("format").execute();
}
