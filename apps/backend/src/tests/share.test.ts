import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTestApp,
  createTestAppWithAuth,
  runMigrations,
  cleanDatabase,
  createTestUser,
  createTestStorage,
  createTestVintage,
  createTestWine,
  createTestWineMaker,
} from "./setup";
import { registerShareRoutes } from "@routes/share.routes.js";
import { db } from "@utils/database.js";
import { auth } from "@utils/auth.js";

const json = (body: unknown, secret?: string) => ({
  headers: {
    "Content-Type": "application/json",
    ...(secret ? { "x-share-guest": secret } : {}),
  },
  body: JSON.stringify(body),
});

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

describe("Share links API", () => {
  let app: OpenAPIHono;
  let vintageId: number;
  let otherVintageId: number;
  let binId: number;

  beforeAll(async () => {
    await runMigrations(db);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    await createTestUser(db);
    const rack = await createTestStorage(db, null, "Rack");
    await db
      .insertInto("storage")
      .values({ name: "Bin 3", locationId: null, parent: rack.id })
      .execute();
    binId = (
      await db
        .selectFrom("storage")
        .select("id")
        .where("name", "=", "Bin 3")
        .executeTakeFirstOrThrow()
    ).id;
    const maker = await createTestWineMaker(db, "Ridge");
    const wine = await createTestWine(db, maker.id, null, "Lytton Springs");
    vintageId = (await createTestVintage(db, wine.id, 2019)).id;
    const other = await createTestWine(db, maker.id, null, "Monte Bello");
    otherVintageId = (await createTestVintage(db, other.id, 2015)).id;
    const bottle = (v: number, status = "stored") => ({
      vintageId: v,
      purchaseDate: "2022-01-01",
      purchasePrice: 40,
      storageId: binId,
      status,
      size: "standard",
    });
    await db
      .insertInto("bottle")
      .values([
        bottle(vintageId),
        bottle(vintageId),
        bottle(otherVintageId),
        bottle(otherVintageId, "drunk"),
      ])
      .execute();
    app = createTestAppWithAuth();
    registerShareRoutes(app);
  });

  async function createLink(overrides: Record<string, unknown> = {}) {
    const res = await app.request("/share", {
      method: "POST",
      ...json({ title: "Thanksgiving", expiresAt: inDays(7), ...overrides }),
    });
    expect(res.status).toBe(201);
    return res.json();
  }

  async function join(token: string, name: string) {
    const res = await app.request(`/public/share/${token}/join`, {
      method: "POST",
      ...json({ name }),
    });
    expect(res.status).toBe(201);
    return (await res.json()).secret as string;
  }

  const mark = (token: string, secret: string, v: number) =>
    app.request(`/public/share/${token}/mark`, {
      method: "POST",
      ...json({ vintageId: v }, secret),
    });

  it("requires a session for host routes but not for the link", async () => {
    const link = await createLink();
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
    const anon = createTestApp();
    registerShareRoutes(anon);
    expect((await anon.request("/share")).status).toBe(401);
    expect((await anon.request(`/public/share/${link.token}`)).status).toBe(
      200,
    );
    expect((await anon.request("/public/share/nope")).status).toBe(404);
  });

  it("shows stored bottles by vintage, with notes and bins but no price", async () => {
    const link = await createLink();
    const res = await app.request(`/public/share/${link.token}`);
    const cellar = await res.json();
    expect(cellar.title).toBe("Thanksgiving");
    expect(cellar.viewerName).toBeNull();
    const lytton = cellar.vintages.find(
      (v: { vintageId: number }) => v.vintageId === vintageId,
    );
    expect(lytton.available).toBe(2);
    expect(lytton.storagePaths).toEqual(["Rack › Bin 3"]);
    const monte = cellar.vintages.find(
      (v: { vintageId: number }) => v.vintageId === otherVintageId,
    );
    expect(monte.available).toBe(1); // the drunk bottle isn't offered
    expect(JSON.stringify(cellar)).not.toMatch(/purchasePrice|price/i);
  });

  it("marks a bottle, shows it as theirs and puts it on the pull list", async () => {
    const link = await createLink();
    const secret = await join(link.token, "Aunt Sue");
    const res = await mark(link.token, secret, vintageId);
    expect(res.status).toBe(201);
    const cellar = await res.json();
    expect(cellar.viewerName).toBe("Aunt Sue");
    expect(cellar.myMarks).toBe(1);
    const lytton = cellar.vintages.find(
      (v: { vintageId: number }) => v.vintageId === vintageId,
    );
    expect(lytton.available).toBe(1);
    expect(lytton.mine).toHaveLength(1);

    const detail = await (await app.request(`/share/${link.id}`)).json();
    expect(detail.marks).toHaveLength(1);
    expect(detail.marks[0]).toMatchObject({
      guest: "Aunt Sue",
      storagePath: "Rack › Bin 3",
      stillStored: true,
    });
    const bottle = await (
      await app.request(`/share/bottle/${detail.marks[0].bottleId}`)
    ).json();
    expect(bottle).toEqual([
      { linkId: link.id, linkTitle: "Thanksgiving", guest: "Aunt Sue" },
    ]);
    // Status is unchanged.
    const row = await db
      .selectFrom("bottle")
      .select("status")
      .where("id", "=", detail.marks[0].bottleId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe("stored");
  });

  it("enforces the cap and runs out of bottles", async () => {
    const link = await createLink({ maxMarks: 2 });
    const sue = await join(link.token, "Sue");
    expect((await mark(link.token, sue, otherVintageId)).status).toBe(201);
    expect((await mark(link.token, sue, otherVintageId)).status).toBe(409); // none left
    expect((await mark(link.token, sue, vintageId)).status).toBe(201);
    expect((await mark(link.token, sue, vintageId)).status).toBe(409); // cap
    const bob = await join(link.token, "Bob");
    expect((await mark(link.token, bob, vintageId)).status).toBe(201);
    const cellar = await (
      await app.request(`/public/share/${link.token}`, {
        headers: { "x-share-guest": bob },
      })
    ).json();
    const lytton = cellar.vintages.find(
      (v: { vintageId: number }) => v.vintageId === vintageId,
    );
    expect(lytton.taken).toEqual([{ name: "Sue", count: 1 }]);
  });

  it("other links see marked bottles as set aside, without names", async () => {
    const a = await createLink();
    const b = await createLink({ title: "Christmas" });
    await mark(a.token, await join(a.token, "Sue"), otherVintageId);
    const res = await mark(b.token, await join(b.token, "Ann"), otherVintageId);
    expect(res.status).toBe(409);
    const cellar = await (await app.request(`/public/share/${b.token}`)).json();
    const monte = cellar.vintages.find(
      (v: { vintageId: number }) => v.vintageId === otherVintageId,
    );
    expect(monte.taken).toEqual([{ name: null, count: 1 }]);
  });

  it("only unmarks your own marks", async () => {
    const link = await createLink();
    const sue = await join(link.token, "Sue");
    const bob = await join(link.token, "Bob");
    const cellar = await (await mark(link.token, sue, vintageId)).json();
    const markId = cellar.vintages.find(
      (v: { vintageId: number }) => v.vintageId === vintageId,
    ).mine[0];
    const del = (secret: string) =>
      app.request(`/public/share/${link.token}/mark/${markId}`, {
        method: "DELETE",
        headers: { "x-share-guest": secret },
      });
    expect((await del(bob)).status).toBe(404);
    expect((await del(sue)).status).toBe(200);
  });

  it("closes on expiry or revoke but keeps the marks; extend reopens", async () => {
    const link = await createLink();
    const sue = await join(link.token, "Sue");
    await mark(link.token, sue, vintageId);
    await db
      .updateTable("shareLink")
      .set({ expiresAt: inDays(-1) })
      .where("id", "=", link.id)
      .execute();
    expect((await app.request(`/public/share/${link.token}`)).status).toBe(410);
    let detail = await (await app.request(`/share/${link.id}`)).json();
    expect(detail.state).toBe("expired");
    expect(detail.marks).toHaveLength(1);

    const extended = await app.request(`/share/${link.id}/extend`, {
      method: "POST",
      ...json({ expiresAt: inDays(3) }),
    });
    expect((await extended.json()).state).toBe("active");

    await app.request(`/share/${link.id}/revoke`, { method: "POST" });
    expect((await app.request(`/public/share/${link.token}`)).status).toBe(410);
    detail = await (await app.request(`/share/${link.id}`)).json();
    expect(detail.state).toBe("revoked");

    const released = await app.request(
      `/share/${link.id}/mark/${detail.marks[0].id}`,
      { method: "DELETE" },
    );
    expect((await released.json()).marks).toHaveLength(0);
  });

  it("lists links with counts and deletes them with their marks", async () => {
    const link = await createLink();
    await mark(link.token, await join(link.token, "Sue"), vintageId);
    const links = await (await app.request("/share")).json();
    expect(links[0]).toMatchObject({ guestCount: 1, markCount: 1 });
    expect(
      (await app.request(`/share/${link.id}`, { method: "DELETE" })).status,
    ).toBe(200);
    const marks = await db.selectFrom("shareMark").selectAll().execute();
    expect(marks).toHaveLength(0);
  });

  it("rejects an expiry in the past", async () => {
    const res = await app.request("/share", {
      method: "POST",
      ...json({ title: "Old", expiresAt: inDays(-1) }),
    });
    expect(res.status).toBe(400);
  });
});
