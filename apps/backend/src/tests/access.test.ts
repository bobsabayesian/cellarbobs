import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTestApp,
  createMockSession,
  runMigrations,
  cleanDatabase,
  createTestUser,
  createTestVintage,
  createTestWine,
  createTestWineMaker,
} from "./setup";
import { registerBottleRoutes } from "@routes/bottles.routes.js";
import { registerStorageRoutes } from "@routes/storages.routes.js";
import { registerLocationRoutes } from "@routes/locations.routes.js";
import { registerVintageRoutes } from "@routes/vintages.routes.js";
import { registerAccessRoutes } from "@routes/access.routes.js";
import { registerShareRoutes } from "@routes/share.routes.js";
import { registerPartyRoutes } from "@routes/parties.routes.js";
import { db } from "@utils/database.js";
import { auth } from "@utils/auth.js";

const json = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Sends the next requests as this user. */
function actAs(userId: string, role: "admin" | "user") {
  vi.spyOn(auth.api, "getSession").mockResolvedValue(
    createMockSession(userId, `${userId}@example.com`, role),
  );
}

describe("Family access", () => {
  let app: OpenAPIHono;
  let vintageId: number;

  const get = async (path: string) => app.request(path);
  const ids = async (path: string) =>
    ((await (await get(path)).json()) as { id: number }[]).map((r) => r.id);

  async function createStorage(user: string, name: string, parent?: number) {
    actAs(user, user === "admin" ? "admin" : "user");
    const res = await app.request(
      "/storage",
      json("POST", { name, locationId: null, parent: parent ?? null }),
    );
    expect(res.status).toBe(201);
    return (await res.json()).id as number;
  }

  const bottleBody = (storageId: number | null) => ({
    vintageId,
    purchaseDate: "2024-01-01",
    purchasePrice: 30,
    storageId,
    status: "stored",
    size: "standard",
  });

  async function addBottle(user: string, storageId: number | null) {
    actAs(user, user === "admin" ? "admin" : "user");
    const res = await app.request(
      "/bottle",
      json("POST", bottleBody(storageId)),
    );
    return res;
  }

  async function grant(
    storageId: number,
    userId: string,
    level: "view" | "edit" | null,
  ) {
    actAs("admin", "admin");
    const res = await app.request(
      `/access/storages/${storageId}/users/${userId}`,
      json("PUT", { level }),
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
    const maker = await createTestWineMaker(db, "Ridge");
    const wine = await createTestWine(db, maker.id, null, "Monte Bello");
    vintageId = (await createTestVintage(db, wine.id, 2015)).id;

    app = createTestApp();
    registerBottleRoutes(app);
    registerStorageRoutes(app);
    registerLocationRoutes(app);
    registerVintageRoutes(app);
    registerAccessRoutes(app);
    registerShareRoutes(app);
    registerPartyRoutes(app);
  });

  it("a storage and its bottles are private to whoever made them", async () => {
    const fridge = await createStorage("sister", "Sister fridge");
    const res = await addBottle("sister", fridge);
    expect(res.status).toBe(201);
    const bottleId = (await res.json()).id;

    actAs("sister", "user");
    expect(await ids("/storage")).toContain(fridge);
    expect(await ids("/bottle")).toEqual([bottleId]);

    actAs("brother", "user");
    expect(await ids("/storage")).not.toContain(fridge);
    expect(await ids("/bottle")).toEqual([]);
    expect((await get(`/bottle/${bottleId}`)).status).toBe(404);
    expect((await get(`/storage/${fridge}`)).status).toBe(404);

    actAs("admin", "admin");
    expect(await ids("/bottle")).toEqual([bottleId]);
  });

  it("the admin can share a storage so both edit what's in it", async () => {
    const fridge = await createStorage("sister", "Shared fridge");
    const bottleId = (await (await addBottle("sister", fridge)).json()).id;
    await grant(fridge, "brother", "edit");

    actAs("brother", "user");
    expect(await ids("/storage")).toContain(fridge);
    expect(await ids("/bottle")).toEqual([bottleId]);
    const update = await app.request(
      `/bottle/${bottleId}`,
      json("PUT", { status: "drunk" }),
    );
    expect(update.status).toBe(200);
    expect((await addBottle("brother", fridge)).status).toBe(201);

    await grant(fridge, "brother", null);
    actAs("brother", "user");
    expect(await ids("/bottle")).toEqual([]);
  });

  it("view-only access reads but never changes", async () => {
    const fridge = await createStorage("sister", "Sister fridge");
    const bottleId = (await (await addBottle("sister", fridge)).json()).id;
    await grant(fridge, "brother", "view");

    actAs("brother", "user");
    expect(await ids("/bottle")).toEqual([bottleId]);
    const put = await app.request(
      `/bottle/${bottleId}`,
      json("PUT", { status: "drunk" }),
    );
    expect(put.status).toBe(403);
    expect((await addBottle("brother", fridge)).status).toBe(403);
    expect(
      (await app.request(`/bottle/${bottleId}`, { method: "DELETE" })).status,
    ).toBe(403);
    expect(
      (await app.request(`/storage/${fridge}`, json("PUT", { name: "Mine" })))
        .status,
    ).toBe(403);
  });

  it("access to a storage covers the storages inside it", async () => {
    const rack = await createStorage("sister", "Rack");
    const shelf = await createStorage("sister", "Shelf", rack);
    const bottleId = (await (await addBottle("sister", shelf)).json()).id;
    await grant(rack, "brother", "edit");

    actAs("brother", "user");
    expect(await ids("/storage")).toEqual(
      expect.arrayContaining([rack, shelf]),
    );
    expect(await ids("/bottle")).toEqual([bottleId]);
  });

  it("a shelf grant doesn't reveal the rack around it", async () => {
    const rack = await createStorage("sister", "Rack");
    const shelf = await createStorage("sister", "Shelf", rack);
    await grant(shelf, "brother", "view");
    actAs("brother", "user");
    expect(await ids("/storage")).toEqual([shelf]);
  });

  it("moving a bottle needs edit on the destination too", async () => {
    const mine = await createStorage("sister", "Mine");
    const hers = await createStorage("brother", "His");
    const bottleId = (await (await addBottle("sister", mine)).json()).id;
    actAs("sister", "user");
    const res = await app.request(
      `/bottle/${bottleId}`,
      json("PUT", { storageId: hers }),
    );
    expect(res.status).toBe(404);
    await grant(hers, "sister", "view");
    actAs("sister", "user");
    expect(
      (
        await app.request(
          `/bottle/${bottleId}`,
          json("PUT", { storageId: hers }),
        )
      ).status,
    ).toBe(403);
    await grant(hers, "sister", "edit");
    actAs("sister", "user");
    expect(
      (
        await app.request(
          `/bottle/${bottleId}`,
          json("PUT", { storageId: hers }),
        )
      ).status,
    ).toBe(200);
  });

  it("a bottle with no storage goes to the user's own hidden storage", async () => {
    const res = await addBottle("sister", null);
    expect(res.status).toBe(201);
    const bottle = await res.json();
    expect(bottle.storageId).not.toBeNull();

    actAs("sister", "user");
    const mine = (await (await get("/storage")).json()) as {
      id: number;
      name: string;
      personalFor: string;
    }[];
    expect(mine.find((s) => s.id === bottle.storageId)).toMatchObject({
      name: "Sis (unsorted)",
      personalFor: "sister",
    });
    expect(await ids("/bottle")).toEqual([bottle.id]);

    actAs("brother", "user");
    expect(await ids("/storage")).not.toContain(bottle.storageId);
    expect(await ids("/bottle")).toEqual([]);

    actAs("admin", "admin");
    expect(await ids("/storage")).toContain(bottle.storageId);

    // Not offered for sharing on the admin screen.
    const overview = await (await get("/access/storages")).json();
    expect(overview.storages.map((s: { id: number }) => s.id)).not.toContain(
      bottle.storageId,
    );
    const personal = await app.request(
      `/access/storages/${bottle.storageId}/users/brother`,
      json("PUT", { level: "view" }),
    );
    expect(personal.status).toBe(403);
  });

  it("deleting a user leaves their personal storage for the admin", async () => {
    const bottle = await (await addBottle("sister", null)).json();
    await db.deleteFrom("user").where("id", "=", "sister").execute();
    const storage = await db
      .selectFrom("storage")
      .select(["id", "personalFor"])
      .where("id", "=", bottle.storageId)
      .executeTakeFirstOrThrow();
    expect(storage.personalFor).toBeNull();
    actAs("admin", "admin");
    expect(await ids("/bottle")).toEqual([bottle.id]);
  });

  it("bottle counts on a vintage only include bottles you can see", async () => {
    const mine = await createStorage("sister", "Mine");
    const hers = await createStorage("brother", "His");
    await addBottle("sister", mine);
    await addBottle("brother", hers);
    await addBottle("brother", hers);
    const stored = async (user: string, role: "admin" | "user") => {
      actAs(user, role);
      const v = await (await get(`/vintage/${vintageId}`)).json();
      return v.bottles.stored;
    };
    expect(await stored("sister", "user")).toBe(1);
    expect(await stored("brother", "user")).toBe(2);
    expect(await stored("admin", "admin")).toBe(3);
  });

  it("a new location is visible to its creator, others once they see a storage in it", async () => {
    actAs("sister", "user");
    const loc = await (
      await app.request("/location", json("POST", { name: "Sister's house" }))
    ).json();
    expect(await ids("/location")).toEqual([loc.id]);
    actAs("brother", "user");
    expect(await ids("/location")).toEqual([]);

    actAs("sister", "user");
    const res = await app.request(
      "/storage",
      json("POST", { name: "Fridge", locationId: loc.id, parent: null }),
    );
    const fridge = (await res.json()).id;
    await grant(fridge, "brother", "view");
    actAs("brother", "user");
    expect(await ids("/location")).toEqual([loc.id]);
  });

  it("only the admin can manage access", async () => {
    const fridge = await createStorage("sister", "Fridge");
    actAs("sister", "user");
    expect((await get("/access/storages")).status).toBe(403);
    const res = await app.request(
      `/access/storages/${fridge}/users/sister`,
      json("PUT", { level: "edit" }),
    );
    expect(res.status).toBe(403);
  });

  it("parties and links belong to whoever made them", async () => {
    const mine = await createStorage("sister", "Mine");
    const pour = [
      (await (await addBottle("sister", mine)).json()).id,
      (await (await addBottle("sister", mine)).json()).id,
    ];
    actAs("sister", "user");
    const link = await (
      await app.request(
        "/share",
        json("POST", {
          title: "Sis dinner",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      )
    ).json();
    const party = await (
      await app.request(
        "/party",
        json("POST", {
          title: "Sis tasting",
          date: "2026-11-07",
          scoreScale: 100,
          format: "beginner",
          bottleIds: pour,
        }),
      )
    ).json();

    actAs("brother", "user");
    expect(await ids("/share")).toEqual([]);
    expect((await get(`/share/${link.id}`)).status).toBe(404);
    expect(await ids("/party")).toEqual([]);
    expect((await get(`/party/${party.id}`)).status).toBe(404);

    actAs("admin", "admin");
    expect(await ids("/share")).toEqual([link.id]);
    expect(await ids("/party")).toEqual([party.id]);
  });

  it("a shared link only shows bottles its creator can see", async () => {
    const mine = await createStorage("sister", "Mine");
    const hers = await createStorage("brother", "His");
    await addBottle("sister", mine);
    await addBottle("brother", hers);
    await addBottle("brother", hers);
    actAs("sister", "user");
    const link = await (
      await app.request(
        "/share",
        json("POST", {
          title: "Dinner",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      )
    ).json();
    // Opened by a guest with no session.
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
    const cellar = await (await get(`/public/share/${link.token}`)).json();
    const available = cellar.vintages.reduce(
      (n: number, v: { available: number }) => n + v.available,
      0,
    );
    expect(available).toBe(1);
  });

  it("a party can only pour bottles you can edit", async () => {
    const hers = await createStorage("brother", "His");
    const bottleIds = [
      (await (await addBottle("brother", hers)).json()).id,
      (await (await addBottle("brother", hers)).json()).id,
    ];
    const body = {
      title: "Tasting",
      date: "2026-11-07",
      scoreScale: 100,
      format: "beginner",
      bottleIds,
    };
    actAs("sister", "user");
    expect((await app.request("/party", json("POST", body))).status).toBe(404);
    await grant(hers, "sister", "view");
    actAs("sister", "user");
    expect((await app.request("/party", json("POST", body))).status).toBe(403);
    await grant(hers, "sister", "edit");
    actAs("sister", "user");
    expect((await app.request("/party", json("POST", body))).status).toBe(201);
  });
});
