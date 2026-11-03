import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations, cleanDatabase } from "./setup";
import { db } from "@utils/database.js";
import { up } from "../migrations/026_setting_hide_consumed.js";
import type { UntypedKysely } from "@schema/untyped.js";

describe("migration 026: hideConsumed setting", () => {
  beforeAll(async () => {
    await runMigrations(db);
    await cleanDatabase(db);
  });

  const value = async () =>
    (
      await db
        .selectFrom("setting")
        .select("value")
        .where("key", "=", "hideConsumed")
        .executeTakeFirst()
    )?.value;

  it("adds the setting, on, without overwriting a later choice", async () => {
    await up(db as unknown as UntypedKysely);
    expect(await value()).toBe("true");
    await db
      .updateTable("setting")
      .set({ value: "false" })
      .where("key", "=", "hideConsumed")
      .execute();
    await up(db as unknown as UntypedKysely);
    expect(await value()).toBe("false");
  });
});
