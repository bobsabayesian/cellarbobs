import type { UntypedKysely } from "@schema/untyped.js";
import { shortText } from "@utils/migration-helpers.js";

/**
 * Pouring bottles one at a time.
 *
 *   tastingParty.pacing   "all" (every bottle visible from the start) or
 *                         "sequential" (guests see a bottle once poured);
 *                         null for earlier parties, which behave as "all"
 *   partyBottle.pouredAt  when the host poured it; guests only see poured
 *                         bottles. Earlier parties count as all poured.
 */
export async function up(db: UntypedKysely): Promise<void> {
  await db.schema
    .alterTable("tastingParty")
    .addColumn("pacing", shortText())
    .execute();
  await db.schema
    .alterTable("partyBottle")
    .addColumn("pouredAt", shortText())
    .execute();
  await db
    .updateTable("partyBottle")
    .set({ pouredAt: new Date().toISOString() })
    .execute();
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.schema.alterTable("partyBottle").dropColumn("pouredAt").execute();
  await db.schema.alterTable("tastingParty").dropColumn("pacing").execute();
}
