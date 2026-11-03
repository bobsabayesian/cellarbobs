import type { UntypedKysely } from "@schema/untyped.js";
import { sql } from "kysely";
import { dialect } from "@utils/migration-helpers.js";

/**
 * Guest bottles at tasting parties: a party bottle now always names its
 * vintage, and only points at a cellar bottle when it came from the cellar.
 *
 *   partyBottle.vintageId  new, NOT NULL, backfilled from the cellar bottle
 *   partyBottle.bottleId   now nullable (null for a guest's bottle)
 *   partyBottle.broughtBy  new, who brought it (null for the host's own)
 *   partyBottle.wantToBuy  new, 0/1: the host flagged it to buy
 *
 * Postgres and MySQL alter in place. SQLite can't drop NOT NULL, so it
 * rebuilds partyBottle. partyReview references partyBottle with ON DELETE
 * CASCADE, and migrations run in a transaction where foreign keys can't be
 * switched off, so dropping partyBottle would delete every review. Reviews
 * are therefore stashed in a plain table, partyReview is dropped first, and
 * both are rebuilt with their constraints and indexes.
 */
export async function up(db: UntypedKysely): Promise<void> {
  if (dialect === "sqlite") return upSqlite(db);

  await sql`ALTER TABLE ${sql.table("partyBottle")} ADD COLUMN ${sql.ref("vintageId")} integer REFERENCES ${sql.table("vintage")}(${sql.ref("id")}) ON DELETE CASCADE`.execute(
    db,
  );
  await sql`ALTER TABLE ${sql.table("partyBottle")} ADD COLUMN ${sql.ref("broughtBy")} ${dialect === "mysql" ? sql`varchar(255)` : sql`text`}`.execute(
    db,
  );
  await sql`ALTER TABLE ${sql.table("partyBottle")} ADD COLUMN ${sql.ref("wantToBuy")} integer NOT NULL DEFAULT 0`.execute(
    db,
  );

  if (dialect === "mysql") {
    await sql`UPDATE partyBottle pb JOIN bottle b ON b.id = pb.bottleId SET pb.vintageId = b.vintageId`.execute(
      db,
    );
    await sql`ALTER TABLE partyBottle MODIFY COLUMN vintageId integer NOT NULL`.execute(
      db,
    );
    await sql`ALTER TABLE partyBottle MODIFY COLUMN bottleId integer NULL`.execute(
      db,
    );
  } else {
    await sql`UPDATE "partyBottle" SET "vintageId" = (SELECT "vintageId" FROM "bottle" WHERE "bottle"."id" = "partyBottle"."bottleId")`.execute(
      db,
    );
    await sql`ALTER TABLE "partyBottle" ALTER COLUMN "vintageId" SET NOT NULL`.execute(
      db,
    );
    await sql`ALTER TABLE "partyBottle" ALTER COLUMN "bottleId" DROP NOT NULL`.execute(
      db,
    );
  }
}

async function upSqlite(db: UntypedKysely): Promise<void> {
  // 1. Keep the reviews somewhere with no foreign keys.
  await sql`CREATE TABLE "partyReview_stash" AS SELECT * FROM "partyReview"`.execute(
    db,
  );
  await sql`DROP TABLE "partyReview"`.execute(db);

  // 2. Rebuild partyBottle. Nothing references it now, so dropping it is safe.
  await sql`
    CREATE TABLE "partyBottle_new" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "partyId" INTEGER NOT NULL REFERENCES "tastingParty"("id") ON DELETE CASCADE,
      "bottleId" INTEGER REFERENCES "bottle"("id") ON DELETE CASCADE,
      "vintageId" INTEGER NOT NULL REFERENCES "vintage"("id") ON DELETE CASCADE,
      "label" TEXT NOT NULL,
      "position" INTEGER NOT NULL,
      "revealedAt" TEXT,
      "broughtBy" TEXT,
      "wantToBuy" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "uq_partyBottle_label" UNIQUE ("partyId", "label"),
      CONSTRAINT "uq_partyBottle_bottle" UNIQUE ("partyId", "bottleId")
    )
  `.execute(db);
  await sql`
    INSERT INTO "partyBottle_new"
      ("id", "partyId", "bottleId", "vintageId", "label", "position", "revealedAt")
    SELECT pb."id", pb."partyId", pb."bottleId", b."vintageId", pb."label", pb."position", pb."revealedAt"
    FROM "partyBottle" pb JOIN "bottle" b ON b."id" = pb."bottleId"
  `.execute(db);
  await sql`DROP TABLE "partyBottle"`.execute(db);
  await sql`ALTER TABLE "partyBottle_new" RENAME TO "partyBottle"`.execute(db);
  await sql`CREATE INDEX "idx_partyBottle_partyId" ON "partyBottle" ("partyId")`.execute(
    db,
  );

  // 3. Recreate partyReview exactly as migration 021 did, then restore it.
  await sql`
    CREATE TABLE "partyReview" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "partyId" INTEGER NOT NULL REFERENCES "tastingParty"("id") ON DELETE CASCADE,
      "partyBottleId" INTEGER NOT NULL REFERENCES "partyBottle"("id") ON DELETE CASCADE,
      "guestId" INTEGER NOT NULL REFERENCES "partyGuest"("id") ON DELETE CASCADE,
      "score" INTEGER,
      "tags" TEXT NOT NULL,
      "structure" TEXT NOT NULL,
      "notes" TEXT NOT NULL,
      "guesses" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      CONSTRAINT "uq_partyReview_guest_bottle" UNIQUE ("guestId", "partyBottleId")
    )
  `.execute(db);
  await sql`
    INSERT INTO "partyReview"
      ("id", "partyId", "partyBottleId", "guestId", "score", "tags", "structure", "notes", "guesses", "updatedAt")
    SELECT "id", "partyId", "partyBottleId", "guestId", "score", "tags", "structure", "notes", "guesses", "updatedAt"
    FROM "partyReview_stash"
  `.execute(db);
  await sql`DROP TABLE "partyReview_stash"`.execute(db);
  await sql`CREATE INDEX "idx_partyReview_partyId" ON "partyReview" ("partyId")`.execute(
    db,
  );
}

/**
 * Removes guest bottles (they have no cellar bottle to point at) and the new
 * columns. Not lossless for parties that had guest bottles. SQLite can't drop
 * a column that's part of a foreign key, so there vintageId stays (unused by
 * the older code, so harmless).
 */
export async function down(db: UntypedKysely): Promise<void> {
  await db.deleteFrom("partyBottle").where("bottleId", "is", null).execute();
  const columns =
    dialect === "sqlite"
      ? ["wantToBuy", "broughtBy"]
      : ["wantToBuy", "broughtBy", "vintageId"];
  for (const column of columns) {
    await db.schema.alterTable("partyBottle").dropColumn(column).execute();
  }
}
