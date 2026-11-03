import type { UntypedKysely } from "@schema/untyped.js";
import { addIdColumn, longText, shortText } from "@utils/migration-helpers.js";

/**
 * Shared links: timed, read-only access to the cellar for people without an
 * account, who can mark bottles to set aside ("what to bring to
 * Thanksgiving"). Timestamps are ISO strings.
 *
 *   shareLink   one link: title, token, expiry, optional cap and message
 *   shareGuest  someone who opened it and gave a name (secret in a cookie)
 *   shareMark   a bottle a guest marked; set aside until released
 */
export async function up(db: UntypedKysely): Promise<void> {
  await addIdColumn(db.schema.createTable("shareLink"))
    .addColumn("title", shortText(), (col) => col.notNull())
    .addColumn("message", longText(), (col) => col.notNull())
    .addColumn("token", shortText(), (col) => col.notNull().unique())
    .addColumn("expiresAt", shortText(), (col) => col.notNull())
    .addColumn("revokedAt", shortText())
    .addColumn("maxMarks", "integer")
    .addColumn("createdBy", shortText(), (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("createdAt", shortText(), (col) => col.notNull())
    .execute();

  await addIdColumn(db.schema.createTable("shareGuest"))
    .addColumn("linkId", "integer", (col) =>
      col.notNull().references("shareLink.id").onDelete("cascade"),
    )
    .addColumn("name", shortText(), (col) => col.notNull())
    .addColumn("secretHash", shortText(), (col) => col.notNull())
    .addColumn("createdAt", shortText(), (col) => col.notNull())
    .execute();

  await addIdColumn(db.schema.createTable("shareMark"))
    .addColumn("linkId", "integer", (col) =>
      col.notNull().references("shareLink.id").onDelete("cascade"),
    )
    .addColumn("guestId", "integer", (col) =>
      col.notNull().references("shareGuest.id").onDelete("cascade"),
    )
    .addColumn("bottleId", "integer", (col) =>
      col.notNull().references("bottle.id").onDelete("cascade"),
    )
    .addColumn("createdAt", shortText(), (col) => col.notNull())
    // One mark per bottle: a bottle set aside for one link is taken for all.
    .addUniqueConstraint("uq_shareMark_bottle", ["bottleId"])
    .execute();

  await db.schema
    .createIndex("idx_shareMark_linkId")
    .on("shareMark")
    .column("linkId")
    .execute();
  await db.schema
    .createIndex("idx_shareGuest_linkId")
    .on("shareGuest")
    .column("linkId")
    .execute();
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.schema.dropTable("shareMark").execute();
  await db.schema.dropTable("shareGuest").execute();
  await db.schema.dropTable("shareLink").execute();
}
