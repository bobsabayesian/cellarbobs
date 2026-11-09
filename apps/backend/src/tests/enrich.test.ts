import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import {
  createTestAppWithAuth,
  createTestAppWithNonAdmin,
  createTestUser,
  createTestWine,
  createTestWineMaker,
  createTestVintage,
  runMigrations,
  cleanDatabase,
} from "./setup";
import { registerEnrichRoutes } from "@routes/enrich.routes.js";
import { db } from "@utils/database.js";
import {
  setLookupClientFactory,
  waitForRun,
} from "@controllers/enrich.controller.js";
import {
  GeminiClient,
  GeminiError,
  type LookupOutcome,
} from "../enrich/gemini.js";
import type { LookupSubject } from "../enrich/prompt.js";

type Lookup = (model: string, subject: LookupSubject) => Promise<LookupOutcome>;

const sources = [{ uri: "https://example.com/barolo", title: "example.com" }];
const found: LookupOutcome = {
  sources,
  response: {
    found: true,
    profile: {
      wine: { style: "Still, full-bodied" },
      serving: { drinkFrom: 2024, drinkUntil: 2045 },
    },
    scores: [
      {
        critic: "James Suckling",
        score: "97/100",
        sourceUrl: "https://jamessuckling.com/x",
      },
    ],
  },
};

let lookup: Lookup;
const calls: { model: string; subject: LookupSubject }[] = [];
function fake(fn: Lookup) {
  lookup = fn;
}

describe("Enrich API", () => {
  let wineId: number;
  let vintageId: number;

  beforeAll(async () => {
    await runMigrations(db);
    setLookupClientFactory(
      () =>
        ({
          lookup: (model, subject) => {
            calls.push({ model, subject });
            return lookup(model, subject);
          },
        }) as Pick<GeminiClient, "lookup">,
    );
  });

  afterAll(() => {
    setLookupClientFactory(() => null);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    await createTestUser(db);
    calls.length = 0;
    fake(async () => found);
    const maker = await createTestWineMaker(db, "Roberto Voerzio");
    wineId = (await createTestWine(db, maker.id, null, "Barolo")).id;
    vintageId = (await createTestVintage(db, wineId, 2017)).id;
  });

  const admin = () => {
    const app = createTestAppWithAuth();
    registerEnrichRoutes(app);
    return app;
  };

  it("looks up a vintage, stores scores and fills its empty window", async () => {
    const app = admin();
    const res = await app.request(`/enrich/vintage/${vintageId}`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      vintageId,
      status: "ok",
      scores: 1,
      filledWindow: true,
      error: null,
    });
    expect(calls[0].model).toBe("gemini-flash-latest");
    expect(calls[0].subject).toMatchObject({
      producer: "Roberto Voerzio",
      wine: "Barolo",
      year: 2017,
    });

    const read = await (
      await app.request(`/enrich/vintage/${vintageId}`)
    ).json();
    expect(read.profile).toMatchObject({
      status: "ok",
      profile: { wine: { style: "Still, full-bodied" } },
      sources,
    });
    expect(read.scores).toMatchObject([
      { critic: "James Suckling", points: 97 },
    ]);

    const vintage = await db
      .selectFrom("vintage")
      .selectAll()
      .where("id", "=", vintageId)
      .executeTakeFirstOrThrow();
    expect([vintage.drinkFrom, vintage.drinkUntil]).toEqual([2024, 2045]);
  });

  it("uses the model from settings and never overwrites a window", async () => {
    await db
      .insertInto("setting")
      .values({ key: "enrichModel", value: "gemini-pro-latest" })
      .execute();
    await db
      .updateTable("vintage")
      .set({ drinkFrom: 2030, drinkUntil: 2050 })
      .where("id", "=", vintageId)
      .execute();
    const res = await admin().request(`/enrich/vintage/${vintageId}`, {
      method: "POST",
    });
    expect((await res.json()).filledWindow).toBe(false);
    expect(calls[0].model).toBe("gemini-pro-latest");
    const vintage = await db
      .selectFrom("vintage")
      .selectAll()
      .where("id", "=", vintageId)
      .executeTakeFirstOrThrow();
    expect(vintage.drinkFrom).toBe(2030);
  });

  it("replaces an earlier lookup and its scores", async () => {
    const app = admin();
    await app.request(`/enrich/vintage/${vintageId}`, { method: "POST" });
    fake(async () => ({ sources: [], response: { found: false } }));
    await app.request(`/enrich/vintage/${vintageId}`, { method: "POST" });
    const read = await (
      await app.request(`/enrich/vintage/${vintageId}`)
    ).json();
    expect(read.profile.status).toBe("not_found");
    expect(read.scores).toEqual([]);
  });

  it("stores a failed lookup without throwing", async () => {
    fake(async () => {
      throw new GeminiError("Gemini's answer wasn't valid JSON", 502);
    });
    const app = admin();
    const res = await app.request(`/enrich/vintage/${vintageId}`, {
      method: "POST",
    });
    expect(await res.json()).toMatchObject({
      status: "error",
      error: "Gemini's answer wasn't valid JSON",
    });
    const read = await (
      await app.request(`/enrich/vintage/${vintageId}`)
    ).json();
    expect(read.profile.status).toBe("error");
  });

  it("reports a bad key instead of storing it", async () => {
    fake(async () => {
      throw new GeminiError("API key not valid", 403);
    });
    const res = await admin().request(`/enrich/vintage/${vintageId}`, {
      method: "POST",
    });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("API key not valid");
  });

  it("only lets an admin look things up", async () => {
    const app = createTestAppWithNonAdmin();
    registerEnrichRoutes(app);
    for (const [path, method] of [
      [`/enrich/vintage/${vintageId}`, "POST"],
      ["/enrich/runs", "POST"],
      ["/enrich/status", "GET"],
      ["/enrich/windows/fill", "POST"],
    ])
      expect((await app.request(path, { method })).status).toBe(403);
  });

  it("estimates an empty window from the wine's other vintages", async () => {
    const v2015 = (await createTestVintage(db, wineId, 2015)).id;
    const v2016 = (await createTestVintage(db, wineId, 2016)).id;
    await db
      .updateTable("vintage")
      .set({ drinkFrom: 2020, drinkUntil: 2035 })
      .where("id", "=", v2015)
      .execute();
    await db
      .updateTable("vintage")
      .set({ drinkFrom: 2023, drinkUntil: 2038 })
      .where("id", "=", v2016)
      .execute();
    const app = admin();

    const read = await (
      await app.request(`/enrich/vintage/${vintageId}`)
    ).json();
    expect(read.windowEstimate).toEqual({
      drinkFrom: 2023,
      drinkUntil: 2038,
      basedOn: 2,
    });

    const res = await app.request("/enrich/windows/fill", { method: "POST" });
    expect(await res.json()).toEqual({ filled: 1 });
    const vintage = await db
      .selectFrom("vintage")
      .selectAll()
      .where("id", "=", vintageId)
      .executeTakeFirstOrThrow();
    expect([vintage.drinkFrom, vintage.drinkUntil]).toEqual([2023, 2038]);
  });

  describe("runs", () => {
    it("looks up every vintage not looked up yet", async () => {
      const app = admin();
      await app.request(`/enrich/vintage/${vintageId}`, { method: "POST" });
      const second = (await createTestVintage(db, wineId, 2019)).id;
      calls.length = 0;

      const res = await app.request("/enrich/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyMissing: true }),
      });
      expect(res.status).toBe(202);
      expect((await res.json()).total).toBe(1);
      await waitForRun();

      expect(calls.map((c) => c.subject.year)).toEqual([2019]);
      const status = await (await app.request("/enrich/status")).json();
      expect(status).toMatchObject({
        configured: true,
        run: {
          status: "done",
          total: 1,
          done: 1,
          failed: 0,
          onlyMissing: true,
        },
      });
      const read = await (
        await app.request(`/enrich/vintage/${second}`)
      ).json();
      expect(read.profile.status).toBe("ok");
    });

    it("refuses a second run while one is going", async () => {
      let release!: () => void;
      fake(() => new Promise((resolve) => (release = () => resolve(found))));
      const app = admin();
      const start = () =>
        app.request("/enrich/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onlyMissing: false }),
        });
      expect((await start()).status).toBe(202);
      expect((await start()).status).toBe(409);
      await new Promise((r) => setTimeout(r, 10));
      release();
      await waitForRun();
    });

    it("stops on a fatal error and says why", async () => {
      await createTestVintage(db, wineId, 2019);
      fake(async () => {
        throw new GeminiError("Quota exceeded", 429);
      });
      const app = admin();
      await app.request("/enrich/runs", { method: "POST", body: "{}" });
      await waitForRun();
      const status = await (await app.request("/enrich/status")).json();
      expect(status.run).toMatchObject({
        status: "failed",
        error: "Quota exceeded",
        done: 0,
      });
      expect(calls).toHaveLength(1);
    });

    it("can be cancelled", async () => {
      await createTestVintage(db, wineId, 2019);
      let release!: () => void;
      fake(() => new Promise((resolve) => (release = () => resolve(found))));
      const app = admin();
      await app.request("/enrich/runs", { method: "POST", body: "{}" });
      await new Promise((r) => setTimeout(r, 10));
      await app.request("/enrich/runs/cancel", { method: "POST" });
      release();
      await waitForRun();
      const status = await (await app.request("/enrich/status")).json();
      expect(status.run).toMatchObject({
        status: "cancelled",
        done: 1,
        total: 2,
      });
    });
  });
});
