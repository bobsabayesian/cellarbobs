import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTestApp,
  createMockSession,
  runMigrations,
  cleanDatabase,
  createTestUser,
  createTestCountry,
  createTestRegion,
  createTestGrape,
  createTestVintage,
  createTestWine,
  createTestWineMaker,
} from "./setup";
import { registerBottleRoutes } from "@routes/bottles.routes.js";
import { registerStorageRoutes } from "@routes/storages.routes.js";
import { registerAccessRoutes } from "@routes/access.routes.js";
import { registerWineRoutes } from "@routes/wines.routes.js";
import { registerVintageRoutes } from "@routes/vintages.routes.js";
import { registerWineMakerRoutes } from "@routes/winemakers.routes.js";
import { registerCountryRoutes } from "@routes/countries.routes.js";
import { registerRegionRoutes } from "@routes/regions.routes.js";
import { registerGrapeRoutes } from "@routes/grapes.routes.js";
import { registerWineGrapeRoutes } from "@routes/winegrapes.routes.js";
import { registerTastingNoteRoutes } from "@routes/tasting-notes.routes.js";
import { db } from "@utils/database.js";
import { auth } from "@utils/auth.js";

const json = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function actAs(userId: string, role: "admin" | "user") {
  vi.spyOn(auth.api, "getSession").mockResolvedValue(
    createMockSession(userId, `${userId}@example.com`, role),
  );
}

describe("Catalog visibility", () => {
  let app: OpenAPIHono;
  // Two wines from two makers in two countries.
  let ridge: {
    wine: number;
    vintage: number;
    maker: number;
    region: number;
    country: number;
    grape: number;
  };
  let other: { wine: number; vintage: number; maker: number; country: number };
  let fridge: number;

  const list = async (path: string) =>
    ((await (await app.request(path)).json()) as { id: number }[]).map(
      (r) => r.id,
    );

  async function grant(user: string, storageId: number) {
    actAs("admin", "admin");
    const res = await app.request(
      `/access/storages/${storageId}/users/${user}`,
      json("PUT", { level: "edit" }),
    );
    expect(res.status).toBe(200);
  }

  beforeAll(async () => {
    await runMigrations(db);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    await createTestUser(db, "admin", "Bob", "bob@example.com");
    await createTestUser(db, "sister", "Sis", "sis@example.com");
    await createTestUser(db, "brother", "Bro", "bro@example.com");
    await db
      .updateTable("user")
      .set({ role: "user" })
      .where("id", "in", ["sister", "brother"])
      .execute();

    const us = await createTestCountry(db, "United States");
    const region = await createTestRegion(db, us.id, "Santa Cruz");
    const grape = await createTestGrape(db, "Zinfandel");
    const maker = await createTestWineMaker(db, "Ridge");
    const wine = await createTestWine(
      db,
      maker.id,
      region.id,
      "Lytton Springs",
    );
    await db
      .insertInto("winegrape")
      .values({ wineId: wine.id, grapeId: grape.id })
      .execute();
    const vintage = await createTestVintage(db, wine.id, 2019);
    ridge = {
      wine: wine.id,
      vintage: vintage.id,
      maker: maker.id,
      region: region.id,
      country: us.id,
      grape: grape.id,
    };

    const fr = await createTestCountry(db, "France");
    const maker2 = await createTestWineMaker(db, "Margaux");
    const wine2 = await createTestWine(db, maker2.id, null, "Pavillon");
    const vintage2 = await createTestVintage(db, wine2.id, 2015);
    other = {
      wine: wine2.id,
      vintage: vintage2.id,
      maker: maker2.id,
      country: fr.id,
    };

    const storage = await db
      .insertInto("storage")
      .values({ name: "Family fridge", locationId: null, parent: null })
      .returning("id")
      .executeTakeFirstOrThrow();
    fridge = storage.id;
    // One Ridge bottle in the shared fridge, one Margaux bottle in a storage nobody else sees.
    const hidden = await db
      .insertInto("storage")
      .values({ name: "Mine", locationId: null, parent: null })
      .returning("id")
      .executeTakeFirstOrThrow();
    const bottle = (vintageId: number, storageId: number) => ({
      vintageId,
      purchaseDate: "2024-01-01",
      purchasePrice: 25,
      storageId,
      status: "stored" as const,
      size: "standard" as const,
    });
    await db
      .insertInto("bottle")
      .values([bottle(vintage.id, fridge), bottle(vintage2.id, hidden.id)])
      .execute();

    app = createTestApp();
    for (const register of [
      registerBottleRoutes,
      registerStorageRoutes,
      registerAccessRoutes,
      registerWineRoutes,
      registerVintageRoutes,
      registerWineMakerRoutes,
      registerCountryRoutes,
      registerRegionRoutes,
      registerGrapeRoutes,
      registerWineGrapeRoutes,
      registerTastingNoteRoutes,
    ])
      register(app);
  });

  it("someone with no bottles sees none of the catalog; the admin sees all", async () => {
    actAs("sister", "user");
    for (const path of [
      "/wine",
      "/vintage",
      "/winemaker",
      "/country",
      "/region",
      "/grape",
      "/winegrape",
    ])
      expect(await list(path)).toEqual([]);
    expect((await app.request(`/wine/${ridge.wine}`)).status).toBe(404);

    actAs("admin", "admin");
    expect(await list("/wine")).toHaveLength(2);
    expect(await list("/country")).toHaveLength(2);
  });

  it("a visible bottle brings in its wine, maker, region, country and grapes", async () => {
    await grant("sister", fridge);
    actAs("sister", "user");
    expect(await list("/vintage")).toEqual([ridge.vintage]);
    expect(await list("/wine")).toEqual([ridge.wine]);
    expect(await list("/winemaker")).toEqual([ridge.maker]);
    expect(await list("/region")).toEqual([ridge.region]);
    expect(await list("/country")).toEqual([ridge.country]);
    expect(await list("/grape")).toEqual([ridge.grape]);
    expect(await list("/winegrape")).toHaveLength(1);
    // The other wine, with no visible bottle, stays out of view.
    expect((await app.request(`/wine/${other.wine}`)).status).toBe(404);
    expect((await app.request(`/winemaker/${other.maker}`)).status).toBe(404);
    expect(await list("/country")).not.toContain(other.country);
  });

  it("records you create are yours to see before any bottle exists", async () => {
    actAs("sister", "user");
    const maker = await (
      await app.request("/winemaker", json("POST", { name: "Sis Cellars" }))
    ).json();
    const wine = await (
      await app.request(
        "/wine",
        json("POST", {
          name: "House Red",
          wineMakerId: maker.id,
          regionId: null,
          type: "red",
        }),
      )
    ).json();
    const vintage = await (
      await app.request(
        "/vintage",
        json("POST", {
          wineId: wine.id,
          year: 2022,
          drinkFrom: null,
          drinkUntil: null,
        }),
      )
    ).json();
    expect(await list("/winemaker")).toEqual([maker.id]);
    expect(await list("/wine")).toEqual([wine.id]);
    expect(await list("/vintage")).toEqual([vintage.id]);

    actAs("brother", "user");
    expect(await list("/winemaker")).toEqual([]);
    expect(await list("/wine")).toEqual([]);
  });

  it("re-adding something hidden from you reuses it instead of failing", async () => {
    actAs("sister", "user");
    const country = await app.request(
      "/country",
      json("POST", { name: "France" }),
    );
    expect((await country.json()).id).toBe(other.country);
    const grape = await app.request(
      "/grape",
      json("POST", { name: "Zinfandel" }),
    );
    expect((await grape.json()).id).toBe(ridge.grape);
    const region = await app.request(
      "/region",
      json("POST", { name: "Santa Cruz", countryId: ridge.country }),
    );
    expect((await region.json()).id).toBe(ridge.region);
    const maker = await app.request(
      "/winemaker",
      json("POST", { name: "Ridge" }),
    );
    expect((await maker.json()).id).toBe(ridge.maker);
    // And now she can see them.
    expect(await list("/country")).toContain(other.country);
    expect(await list("/winemaker")).toContain(ridge.maker);
    // Adding one she can already see is still a duplicate.
    const again = await app.request(
      "/country",
      json("POST", { name: "France" }),
    );
    expect(again.status).toBe(409);
  });

  it("re-adding a hidden wine or vintage reuses it", async () => {
    actAs("sister", "user");
    await app.request("/winemaker", json("POST", { name: "Ridge" }));
    const wine = await (
      await app.request(
        "/wine",
        json("POST", {
          name: "Lytton Springs",
          wineMakerId: ridge.maker,
          regionId: null,
          type: "red",
        }),
      )
    ).json();
    expect(wine.id).toBe(ridge.wine);
    const vintage = await (
      await app.request(
        "/vintage",
        json("POST", {
          wineId: wine.id,
          year: 2019,
          drinkFrom: null,
          drinkUntil: null,
        }),
      )
    ).json();
    expect(vintage.id).toBe(ridge.vintage);
    expect(await list("/vintage")).toEqual([ridge.vintage]);
    const count = await db.selectFrom("wine").select("id").execute();
    expect(count).toHaveLength(2);
  });

  it("can't edit or delete what you can't see", async () => {
    actAs("sister", "user");
    expect(
      (
        await app.request(
          `/winemaker/${ridge.maker}`,
          json("PUT", { name: "X" }),
        )
      ).status,
    ).toBe(404);
    expect(
      (await app.request(`/wine/${ridge.wine}`, { method: "DELETE" })).status,
    ).toBe(404);
  });

  it("tasting notes are shared among people who see the vintage", async () => {
    await grant("sister", fridge);
    await grant("brother", fridge);
    actAs("sister", "user");
    const note = await (
      await app.request(
        "/tasting-note",
        json("POST", { vintageId: ridge.vintage, score: 8, notes: "Brambly" }),
      )
    ).json();
    actAs("brother", "user");
    expect(await list("/tasting-note")).toEqual([note.id]);
    expect(await list(`/tasting-note/vintage/${ridge.vintage}`)).toEqual([
      note.id,
    ]);
    const wine = await (await app.request(`/wine/${ridge.wine}`)).json();
    expect(wine.tastingNotesCount).toBe(1);
    // Only the author edits.
    expect(
      (await app.request(`/tasting-note/${note.id}`, json("PUT", { score: 2 })))
        .status,
    ).toBe(403);
    actAs("sister", "user");
    expect(
      (await app.request(`/tasting-note/${note.id}`, json("PUT", { score: 9 })))
        .status,
    ).toBe(200);
    actAs("admin", "admin");
    expect(
      (await app.request(`/tasting-note/${note.id}`, json("PUT", { score: 7 })))
        .status,
    ).toBe(200);
  });

  it("can't write a note on a vintage you can't see", async () => {
    actAs("sister", "user");
    const res = await app.request(
      "/tasting-note",
      json("POST", { vintageId: other.vintage, score: 5, notes: "" }),
    );
    expect(res.status).toBe(404);
  });

  it("losing access to the storage hides the records again", async () => {
    await grant("sister", fridge);
    actAs("admin", "admin");
    await app.request(
      `/access/storages/${fridge}/users/sister`,
      json("PUT", { level: null }),
    );
    actAs("sister", "user");
    expect(await list("/wine")).toEqual([]);
  });
});
