import type { UntypedKysely } from "@schema/untyped.js";
import { addIdColumn, longText, shortText } from "@utils/migration-helpers.js";

/**
 * Wine data looked up online for a vintage (see src/enrich). Timestamps are
 * ISO strings; JSON is stored as text on every dialect.
 *
 *   vintageProfile  the latest lookup for a vintage: status, model, the
 *                   profile JSON and the web pages it was based on
 *   vintageScore    critic scores from that lookup, each with its source
 *   enrichRun       an admin's "look up every vintage" run and its progress
 *
 * Settings:
 *   enrichModel        the Gemini model to ask
 *   enrichFillWindows  fill a vintage's empty drinking window from a lookup
 */
export async function up(db: UntypedKysely): Promise<void> {
  await addIdColumn(db.schema.createTable("vintageProfile"))
    .addColumn("vintageId", "integer", (col) =>
      col.notNull().unique().references("vintage.id").onDelete("cascade"),
    )
    .addColumn("status", shortText(), (col) => col.notNull())
    .addColumn("model", shortText(), (col) => col.notNull())
    .addColumn("profile", longText())
    .addColumn("sources", longText())
    .addColumn("error", longText())
    .addColumn("fetchedAt", shortText(), (col) => col.notNull())
    .execute();

  await addIdColumn(db.schema.createTable("vintageScore"))
    .addColumn("vintageId", "integer", (col) =>
      col.notNull().references("vintage.id").onDelete("cascade"),
    )
    .addColumn("critic", shortText(), (col) => col.notNull())
    .addColumn("score", shortText(), (col) => col.notNull())
    .addColumn("points", "integer")
    .addColumn("sourceUrl", longText())
    .execute();
  await db.schema
    .createIndex("idx_vintageScore_vintageId")
    .on("vintageScore")
    .column("vintageId")
    .execute();

  await addIdColumn(db.schema.createTable("enrichRun"))
    .addColumn("status", shortText(), (col) => col.notNull())
    // 0/1 on every dialect, like image.isFavourite.
    .addColumn("onlyMissing", "integer", (col) => col.notNull())
    .addColumn("total", "integer", (col) => col.notNull())
    .addColumn("done", "integer", (col) => col.notNull())
    .addColumn("failed", "integer", (col) => col.notNull())
    .addColumn("startedBy", shortText(), (col) => col.notNull())
    .addColumn("startedAt", shortText(), (col) => col.notNull())
    .addColumn("finishedAt", shortText())
    .addColumn("error", longText())
    .execute();

  for (const setting of [
    { key: "enrichModel", value: "gemini-flash-latest" },
    { key: "enrichFillWindows", value: "true" },
  ]) {
    const existing = await db
      .selectFrom("setting")
      .select("key")
      .where("key", "=", setting.key)
      .executeTakeFirst();
    if (!existing) await db.insertInto("setting").values(setting).execute();
  }
}

export async function down(db: UntypedKysely): Promise<void> {
  await db.schema.dropTable("enrichRun").execute();
  await db.schema.dropTable("vintageScore").execute();
  await db.schema.dropTable("vintageProfile").execute();
  await db
    .deleteFrom("setting")
    .where("key", "in", ["enrichModel", "enrichFillWindows"])
    .execute();
}
