import type { UntypedKysely } from "@schema/untyped.js";
import { longText } from "@utils/migration-helpers.js";

/**
 * Guest bottles at tasting parties become real inventory bottles (status
 * "in-tasting" during the party, "drunk" after), and a party remembers which
 * wine records it created for them so cancelling can remove them again.
 *
 *   partyBottle.createdRecords  JSON {winemakerId?, wineId?, vintageId?} of
 *                               records this party inserted, or null
 *
 * Guest bottles added before this migration had no bottle row (bottleId
 * null); they get one here, matching what the party would now have made.
 * Those in cancelled parties are left alone, since nothing counts them.
 */
export async function up(db: UntypedKysely): Promise<void> {
  await db.schema
    .alterTable("partyBottle")
    .addColumn("createdRecords", longText())
    .execute();

  const orphans = await db
    .selectFrom("partyBottle")
    .innerJoin("tastingParty", "tastingParty.id", "partyBottle.partyId")
    .select([
      "partyBottle.id as id",
      "partyBottle.vintageId as vintageId",
      "partyBottle.broughtBy as broughtBy",
      "tastingParty.date as date",
      "tastingParty.title as title",
      "tastingParty.status as status",
    ])
    .where("partyBottle.bottleId", "is", null)
    .where("tastingParty.status", "in", ["active", "finished"])
    .execute();

  for (const row of orphans) {
    const finished = row.status === "finished";
    const consumedNote = finished
      ? `Brought by ${String(row.broughtBy ?? "a guest")} · Blind tasting: ${String(row.title)}`
      : null;
    await db
      .insertInto("bottle")
      .values({
        vintageId: row.vintageId,
        purchaseDate: row.date,
        purchasePrice: 0,
        storageId: null,
        status: finished ? "drunk" : "in-tasting",
        size: "standard",
        consumedDate: finished ? row.date : null,
        consumedNote,
      })
      .execute();
    // Portable "last insert id": the newest bottle for this vintage.
    const bottle = await db
      .selectFrom("bottle")
      .select("id")
      .where("vintageId", "=", row.vintageId)
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("partyBottle")
      .set({ bottleId: bottle.id })
      .where("id", "=", row.id)
      .execute();
  }
}

/**
 * Drops the column. Bottles created for guest bottles stay: deleting them
 * would also remove the party bottles and reviews that point at them.
 */
export async function down(db: UntypedKysely): Promise<void> {
  await db.schema
    .alterTable("partyBottle")
    .dropColumn("createdRecords")
    .execute();
}
