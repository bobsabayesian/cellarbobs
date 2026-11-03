import type { UntypedKysely } from "@schema/untyped.js";
import { addIdColumn, longText, shortText } from "@utils/migration-helpers.js";

/**
 * Blind tasting parties ("Party Mode").
 *
 * Timestamps are ISO strings in shortText and JSON fields are strings in
 * longText, so every dialect reads them back in the same shape.
 */
export async function up(db: UntypedKysely): Promise<void> {
  await addIdColumn(db.schema.createTable("tastingParty"))
    .addColumn("title", shortText(), (col) => col.notNull())
    .addColumn("date", shortText(), (col) => col.notNull())
    .addColumn("status", shortText(), (col) => col.notNull())
    .addColumn("token", shortText(), (col) => col.notNull().unique())
    .addColumn("scoreScale", "integer", (col) => col.notNull())
    .addColumn("hostUserId", shortText(), (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("createdAt", shortText(), (col) => col.notNull())
    .addColumn("finishedAt", shortText())
    .execute();

  await addIdColumn(db.schema.createTable("partyBottle"))
    .addColumn("partyId", "integer", (col) =>
      col.notNull().references("tastingParty.id").onDelete("cascade"),
    )
    .addColumn("bottleId", "integer", (col) =>
      col.notNull().references("bottle.id").onDelete("cascade"),
    )
    .addColumn("label", shortText(), (col) => col.notNull())
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("revealedAt", shortText())
    .addUniqueConstraint("uq_partyBottle_label", ["partyId", "label"])
    .addUniqueConstraint("uq_partyBottle_bottle", ["partyId", "bottleId"])
    .execute();

  await addIdColumn(db.schema.createTable("partyGuest"))
    .addColumn("partyId", "integer", (col) =>
      col.notNull().references("tastingParty.id").onDelete("cascade"),
    )
    .addColumn("name", shortText(), (col) => col.notNull())
    .addColumn("nameKey", shortText(), (col) => col.notNull())
    .addColumn("secretHash", shortText(), (col) => col.notNull())
    .addColumn("userId", shortText(), (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("createdAt", shortText(), (col) => col.notNull())
    .execute();

  await addIdColumn(db.schema.createTable("partyReview"))
    .addColumn("partyId", "integer", (col) =>
      col.notNull().references("tastingParty.id").onDelete("cascade"),
    )
    .addColumn("partyBottleId", "integer", (col) =>
      col.notNull().references("partyBottle.id").onDelete("cascade"),
    )
    .addColumn("guestId", "integer", (col) =>
      col.notNull().references("partyGuest.id").onDelete("cascade"),
    )
    .addColumn("score", "integer")
    .addColumn("tags", longText(), (col) => col.notNull())
    .addColumn("structure", longText(), (col) => col.notNull())
    .addColumn("notes", longText(), (col) => col.notNull())
    .addColumn("guesses", longText(), (col) => col.notNull())
    .addColumn("updatedAt", shortText(), (col) => col.notNull())
    .addUniqueConstraint("uq_partyReview_guest_bottle", [
      "guestId",
      "partyBottleId",
    ])
    .execute();

  for (const [table, column] of [
    ["partyBottle", "partyId"],
    ["partyGuest", "partyId"],
    ["partyReview", "partyId"],
  ] as const) {
    await db.schema
      .createIndex(`idx_${table}_${column}`)
      .on(table)
      .column(column)
      .execute();
  }
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.schema.dropTable("partyReview").execute();
  await db.schema.dropTable("partyGuest").execute();
  await db.schema.dropTable("partyBottle").execute();
  await db.schema.dropTable("tastingParty").execute();
}
