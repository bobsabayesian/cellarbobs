import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTestApp,
  createTestAppWithAuth,
  runMigrations,
  cleanDatabase,
  createTestUser,
  createTestVintage,
  createTestWine,
  createTestWineMaker,
} from "./setup";
import { registerPartyRoutes } from "@routes/parties.routes.js";
import { db } from "@utils/database.js";
import { auth } from "@utils/auth.js";

const json = (body: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function createStoredBottles(count: number): Promise<number[]> {
  const maker = await createTestWineMaker(db, "Sottimano");
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const wine = await createTestWine(db, maker.id, null, `Barbaresco ${i}`);
    const vintage = await createTestVintage(db, wine.id, 2016 + i);
    const bottle = await db
      .insertInto("bottle")
      .values({
        vintageId: vintage.id,
        purchaseDate: "2022-01-01",
        purchasePrice: 50,
        storageId: null,
        status: "stored",
        size: "standard",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    ids.push(bottle.id);
  }
  return ids;
}

async function bottleStatuses(ids: number[]) {
  const rows = await db
    .selectFrom("bottle")
    .select(["id", "status", "consumedDate", "consumedNote"])
    .where("id", "in", ids)
    .execute();
  return rows;
}

describe("Party API", () => {
  let app: OpenAPIHono;
  let bottleIds: number[];

  beforeAll(async () => {
    await runMigrations(db);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    await createTestUser(db);
    bottleIds = await createStoredBottles(3);
    app = createTestAppWithAuth();
    registerPartyRoutes(app);
  });

  async function createParty(overrides: Record<string, unknown> = {}) {
    const res = await app.request("/party", {
      method: "POST",
      ...json({
        title: "Fall Nebbiolo",
        date: "2026-11-07",
        scoreScale: 100,
        format: "advanced",
        bottleIds,
        ...overrides,
      }),
    });
    return { res, party: await res.json() };
  }

  async function join(token: string, name: string) {
    const res = await app.request(`/public/party/${token}/join`, {
      method: "POST",
      ...json({ name }),
    });
    return (await res.json()) as { secret: string; guestId: number };
  }

  function review(token: string, label: string, secret: string, body: unknown) {
    return app.request(`/public/party/${token}/review/${label}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-party-guest": secret },
      body: JSON.stringify(body),
    });
  }

  it("requires a session for host routes but not for guest routes", async () => {
    const { party } = await createParty();
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
    const anon = createTestApp();
    registerPartyRoutes(anon);
    expect((await anon.request("/party")).status).toBe(401);
    expect((await anon.request(`/party/${party.id}`)).status).toBe(401);
    expect((await anon.request("/party/export")).status).toBe(401);
    expect((await anon.request(`/public/party/${party.token}`)).status).toBe(
      200,
    );
    expect((await anon.request("/public/party/wrong-token")).status).toBe(404);
  });

  it("creates a party, pulls the bottles and labels them A-C", async () => {
    const { res, party } = await createParty();
    expect(res.status).toBe(201);
    expect(party.status).toBe("active");
    expect(party.token).toMatch(/^[\w-]{20,}$/);
    expect(party.bottles.map((b: { label: string }) => b.label)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(
      new Set(party.bottles.map((b: { bottleId: number }) => b.bottleId)),
    ).toEqual(new Set(bottleIds));
    expect(party.guests).toEqual([
      expect.objectContaining({ name: "Test User", isHost: true }),
    ]);
    const statuses = await bottleStatuses(bottleIds);
    expect(statuses.every((b) => b.status === "in-tasting")).toBe(true);
  });

  it("refuses bottles that aren't stored", async () => {
    await createParty();
    const { res } = await createParty();
    expect(res.status).toBe(409);
  });

  it("rejects fewer than two bottles", async () => {
    const { res } = await createParty({ bottleIds: [bottleIds[0]] });
    expect(res.status).toBe(400);
  });

  it("hides unrevealed wines from guests and shows them after reveal", async () => {
    const { party } = await createParty();
    let view = await (await app.request(`/public/party/${party.token}`)).json();
    expect(view.bottles.every((b: { wine: unknown }) => b.wine === null)).toBe(
      true,
    );
    expect(JSON.stringify(view)).not.toContain("Barbaresco");

    const target = party.bottles[0];
    await app.request(`/party/${party.id}/reveal/${target.id}`, {
      method: "POST",
    });
    view = await (await app.request(`/public/party/${party.token}`)).json();
    expect(view.bottles[0]).toMatchObject({
      label: "A",
      revealed: true,
      wine: { winemaker: "Sottimano" },
    });
    expect(view.bottles[1].wine).toBeNull();
  });

  it("lets a guest save and update their own review only", async () => {
    const { party } = await createParty();
    const ana = await join(party.token, "Ana");
    const bo = await join(party.token, "Bo");

    let res = await review(party.token, "A", ana.secret, {
      score: 91,
      answers: {
        p_fruit: ["cherry"],
        p_earth: ["tar"],
        tannin: "high",
        acidity: "medium+",
      },
    });
    expect(res.status).toBe(200);
    res = await review(party.token, "a", ana.secret, { notes: "Roses." });
    const saved = await res.json();
    // Tags and 1-5 structure are derived from the format answers.
    expect(saved).toMatchObject({
      score: 91,
      tags: ["cherry", "tar"],
      structure: { tannin: 5, acidity: 4 },
      answers: { tannin: "high", acidity: "medium+" },
      notes: "Roses.",
    });

    await review(party.token, "A", bo.secret, { score: 85 });
    const mine = await (
      await app.request(`/public/party/${party.token}/me`, {
        headers: { "x-party-guest": ana.secret },
      })
    ).json();
    expect(mine.reviews).toHaveLength(1);
    expect(mine.reviews[0].score).toBe(91);

    res = await review(party.token, "A", "not-a-secret", { score: 10 });
    expect(res.status).toBe(403);
    res = await review(party.token, "A", ana.secret, {
      answers: { p_fruit: ["glitter"] },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Fruit: not an option: glitter");
    res = await review(party.token, "A", ana.secret, { tags: ["tar"] });
    expect(res.status).toBe(400);
    res = await review(party.token, "Z", ana.secret, { score: 80 });
    expect(res.status).toBe(404);
  });

  it("finishing marks bottles drunk and saves the host's notes", async () => {
    const { party } = await createParty();
    const host = await (
      await app.request(`/party/${party.id}/host-session`, { method: "POST" })
    ).json();
    await review(party.token, "A", host.secret, {
      score: 94,
      notes: "Tar and roses",
      answers: { p_earth: ["tar"], finish: "long" },
      guesses: { grape: "Nebbiolo", vintage: 2016 },
    });
    const guest = await join(party.token, "Ana");
    await review(party.token, "A", guest.secret, { score: 80 });

    const res = await app.request(`/party/${party.id}/finish`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("finished");

    const statuses = await bottleStatuses(bottleIds);
    expect(statuses.every((b) => b.status === "drunk")).toBe(true);
    expect(statuses[0]).toMatchObject({
      consumedDate: "2026-11-07",
      consumedNote: "Blind tasting: Fall Nebbiolo",
    });

    const notes = await db.selectFrom("tastingNote").selectAll().execute();
    expect(notes).toHaveLength(1); // the host's only, not the guest's
    expect(notes[0]).toMatchObject({ score: 9, authorId: "test-user-1" });
    expect(notes[0].notes).toContain("Tar and roses");
    expect(notes[0].notes).toContain("Tags: tar");
    expect(notes[0].notes).toContain("Finish length: long");
    expect(notes[0].notes).toContain("Guessed: grape Nebbiolo, vintage 2016");
    expect(notes[0].notes).toContain(
      'Blind tasting "Fall Nebbiolo", bottle A: 94/100',
    );

    // A finished party stays readable, fully revealed, but closed to edits.
    const finished = await app.request(`/public/party/${party.token}`);
    expect(finished.status).toBe(200);
    const view = await finished.json();
    expect(view.status).toBe("finished");
    expect(view.bottles.every((b: { revealed: boolean }) => b.revealed)).toBe(
      true,
    );
    expect(
      (await review(party.token, "A", guest.secret, { score: 1 })).status,
    ).toBe(409);
    expect(
      (
        await app.request(`/public/party/${party.token}/join`, {
          method: "POST",
          ...json({ name: "Late" }),
        })
      ).status,
    ).toBe(409);

    // Guests can still read and download their own notes.
    const mine = await (
      await app.request(`/public/party/${party.token}/me`, {
        headers: { "x-party-guest": guest.secret },
      })
    ).json();
    expect(mine).toMatchObject({ name: "Ana", isHost: false, partyId: null });
    const pdf = await app.request(`/public/party/${party.token}/me/pdf`, {
      headers: { "x-party-guest": guest.secret },
    });
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("content-disposition")).toContain("my notes.pdf");
    expect(
      (await app.request(`/public/party/${party.token}/me/pdf`)).status,
    ).toBe(403);

    // The host's session says so, with the id for the link back.
    const hostMe = await (
      await app.request(`/public/party/${party.token}/me`, {
        headers: { "x-party-guest": host.secret },
      })
    ).json();
    expect(hostMe).toMatchObject({ isHost: true, partyId: party.id });

    // The bottle page can find the party it was poured at.
    const poured = await (
      await app.request(`/party/bottle/${party.bottles[0].bottleId}`)
    ).json();
    expect(poured).toEqual([
      expect.objectContaining({
        id: party.id,
        title: "Fall Nebbiolo",
        status: "finished",
        label: party.bottles[0].label,
      }),
    ]);
  });

  it("cancelling returns the bottles to their bins", async () => {
    const { party } = await createParty();
    const res = await app.request(`/party/${party.id}/cancel`, {
      method: "POST",
    });
    expect((await res.json()).status).toBe("cancelled");
    const statuses = await bottleStatuses(bottleIds);
    expect(statuses.every((b) => b.status === "stored")).toBe(true);
    expect(
      (await app.request(`/party/${party.id}/finish`, { method: "POST" }))
        .status,
    ).toBe(409);
  });

  it("exports reviews of revealed bottles as CSV", async () => {
    const { party } = await createParty();
    const guest = await join(party.token, "Ana");
    await review(party.token, "A", guest.secret, {
      score: 90,
      notes: 'say "hi", ok',
    });
    await review(party.token, "B", guest.secret, { score: 70 });
    await app.request(`/party/${party.id}/reveal/${party.bottles[0].id}`, {
      method: "POST",
    });
    const csv = await (await app.request("/party/export")).text();
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2); // header + the revealed bottle only
    expect(lines[1]).toContain('"say ""hi"", ok"');
    expect(lines[1]).toContain("Sottimano");
  });

  it("rate limits guests joining", async () => {
    const { party } = await createParty();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await app.request(`/public/party/${party.token}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-ip": "9.9.9.9",
        },
        body: JSON.stringify({ name: `Guest ${i}` }),
      });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 201).length).toBe(10);
    expect(statuses.at(-1)).toBe(429);
  });

  describe("guest bottles", () => {
    async function guestWine(name = "Sauvignon Blanc") {
      const maker = await createTestWineMaker(db, "Merry Edwards");
      const wine = await createTestWine(db, maker.id, null, name);
      return wine.id;
    }

    const newWine = (name: string, maker = "Fable Farm") => ({
      wine: {
        name,
        type: "white" as const,
        winemaker: { name: maker },
        country: null,
        region: null,
        grapes: [],
      },
      vintage: { year: 2021, drinkFrom: null, drinkUntil: null },
    });

    async function guestBottleRow(partyId: number, label: string) {
      return db
        .selectFrom("partyBottle")
        .innerJoin("bottle", "bottle.id", "partyBottle.bottleId")
        .select([
          "bottle.id as bottleId",
          "bottle.status as status",
          "bottle.purchasePrice as price",
          "bottle.storageId as storageId",
          "bottle.consumedNote as consumedNote",
          "partyBottle.vintageId as vintageId",
        ])
        .where("partyBottle.partyId", "=", partyId)
        .where("partyBottle.label", "=", label)
        .executeTakeFirstOrThrow();
    }

    const exists = async (
      table: "bottle" | "vintage" | "wine" | "winemaker",
      id: number,
    ) =>
      !!(await db
        .selectFrom(table)
        .select("id")
        .where("id", "=", id)
        .executeTakeFirst());

    it("gives a guest's bottle an inventory bottle that's out for the tasting", async () => {
      const wineId = await guestWine();
      const existing = await createTestVintage(db, wineId, 2019);
      const { res, party } = await createParty({
        bottleIds: [],
        guestBottles: [
          { wineId, year: 2019, broughtBy: "Dave" },
          { wineId, year: 2021 },
        ],
      });
      expect(res.status).toBe(201);
      for (const b of party.bottles) {
        expect(b.bottleId).not.toBeNull();
        const row = await guestBottleRow(party.id, b.label);
        // Kept in the host's personal storage so whoever sees the party sees it.
        expect(row.status).toBe("in-tasting");
        const home = await db
          .selectFrom("storage")
          .select("personalFor")
          .where("id", "=", row.storageId)
          .executeTakeFirstOrThrow();
        expect(home.personalFor).toBe("test-user-1");
        expect(Number(row.price)).toBe(0);
      }
      expect(
        party.bottles.map((b: { vintageId: number }) => b.vintageId),
      ).toContain(existing.id);
      expect(
        party.bottles.map((b: { broughtBy: string }) => b.broughtBy).sort(),
      ).toEqual(["A guest", "Dave"]);
    });

    it("creates a new wine with the party and removes it all on cancel", async () => {
      const { res, party } = await createParty({
        bottleIds: [bottleIds[0]],
        guestBottles: [{ newWine: newWine("Fluxion"), broughtBy: "Dave" }],
      });
      expect(res.status).toBe(201);
      const guest = party.bottles.find(
        (b: { broughtBy: string | null }) => b.broughtBy,
      );
      expect(guest.wine).toMatchObject({
        winemaker: "Fable Farm",
        wineName: "Fluxion",
      });
      const row = await guestBottleRow(party.id, guest.label);
      const vintage = await db
        .selectFrom("vintage")
        .select(["id", "wineId"])
        .where("id", "=", row.vintageId)
        .executeTakeFirstOrThrow();
      const wine = await db
        .selectFrom("wine")
        .select(["id", "wineMakerId"])
        .where("id", "=", vintage.wineId)
        .executeTakeFirstOrThrow();

      // Someone rated it; cancelling still removes it.
      const g = await join(party.token, "Ana");
      await review(party.token, guest.label, g.secret, { score: 90 });

      const cancel = await app.request(`/party/${party.id}/cancel`, {
        method: "POST",
      });
      expect(cancel.status).toBe(200);
      expect(await exists("bottle", row.bottleId)).toBe(false);
      expect(await exists("vintage", vintage.id)).toBe(false);
      expect(await exists("wine", wine.id)).toBe(false);
      expect(await exists("winemaker", wine.wineMakerId)).toBe(false);
      const [cellar] = await bottleStatuses([bottleIds[0]]);
      expect(cellar.status).toBe("stored");
    });

    it("keeps wine records something else still uses", async () => {
      // The party creates the 2021 vintage, but a tasting note lands on it.
      const wineId = await guestWine();
      const { party } = await createParty({
        bottleIds: [bottleIds[0]],
        guestBottles: [{ wineId, year: 2021, broughtBy: "Dave" }],
      });
      const guest = party.bottles.find(
        (b: { broughtBy: string | null }) => b.broughtBy,
      );
      await db
        .insertInto("tastingNote")
        .values({
          vintageId: guest.vintageId,
          authorId: "test-user-1",
          date: "2026-11-07T20:00:00.000Z",
          score: 8,
          notes: "kept",
        })
        .execute();
      await app.request(`/party/${party.id}/cancel`, { method: "POST" });
      expect(await exists("vintage", guest.vintageId)).toBe(true);
      expect(await exists("wine", wineId)).toBe(true); // existed before the party
      expect(await exists("bottle", guest.bottleId)).toBe(false);
    });

    it("adds a guest bottle mid-party under the next label, and removes it", async () => {
      const { party } = await createParty();
      let res = await app.request(`/party/${party.id}/guest-bottle`, {
        method: "POST",
        ...json({ newWine: newWine("Cidre"), broughtBy: "Hannah" }),
      });
      expect(res.status).toBe(201);
      const added = (await res.json()).bottles.find(
        (b: { label: string }) => b.label === "D",
      );
      expect(added).toMatchObject({ broughtBy: "Hannah" });

      // Guests only see who brought it after the reveal.
      const view = await (
        await app.request(`/public/party/${party.token}`)
      ).json();
      expect(view.bottles[3]).toMatchObject({ label: "D", broughtBy: null });

      const row = await guestBottleRow(party.id, "D");
      res = await app.request(`/party/${party.id}/bottle/${added.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      expect(await exists("bottle", row.bottleId)).toBe(false);
      expect(await exists("vintage", row.vintageId)).toBe(false);
      expect((await res.json()).bottles).toHaveLength(3);

      // A rated bottle can't be removed; an unrated cellar bottle goes back.
      const g = await join(party.token, "Ana");
      await review(party.token, "A", g.secret, { score: 90 });
      const rated = party.bottles.find(
        (b: { label: string }) => b.label === "A",
      );
      res = await app.request(`/party/${party.id}/bottle/${rated.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(409);
      const cellar = party.bottles.find(
        (b: { label: string }) => b.label === "B",
      );
      res = await app.request(`/party/${party.id}/bottle/${cellar.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const [status] = await bottleStatuses([cellar.bottleId]);
      expect(status.status).toBe("stored");
    });

    it("finishing records guest bottles as drunk, with who brought them", async () => {
      const wineId = await guestWine();
      const { party } = await createParty({
        bottleIds: [bottleIds[0]],
        guestBottles: [{ wineId, year: 2019, broughtBy: "Dave" }],
      });
      const host = await (
        await app.request(`/party/${party.id}/host-session`, { method: "POST" })
      ).json();
      const guest = party.bottles.find(
        (b: { broughtBy: string | null }) => b.broughtBy,
      );
      await review(party.token, guest.label, host.secret, { score: 96 });

      await app.request(`/party/${party.id}/finish`, { method: "POST" });
      const row = await guestBottleRow(party.id, guest.label);
      expect(row).toMatchObject({
        status: "drunk",
        consumedNote: "Brought by Dave · Blind tasting: Fall Nebbiolo",
      });
      const [cellar] = await bottleStatuses([bottleIds[0]]);
      expect(cellar).toMatchObject({
        status: "drunk",
        consumedNote: "Blind tasting: Fall Nebbiolo",
      });
      const notes = await db.selectFrom("tastingNote").selectAll().execute();
      expect(notes).toHaveLength(1);
      expect(notes[0].vintageId).toBe(guest.vintageId);
    });
    it("flags wines to buy and lists them with scores", async () => {
      const wineId = await guestWine();
      const { party } = await createParty({
        bottleIds: [bottleIds[0]],
        guestBottles: [{ wineId, year: 2019, broughtBy: "Dave" }],
      });
      const target = party.bottles.find(
        (b: { broughtBy: string | null }) => b.broughtBy !== null,
      );
      const guest = await join(party.token, "Ana");
      await review(party.token, target.label, guest.secret, { score: 94 });

      const res = await app.request(
        `/party/${party.id}/bottle/${target.id}/want-to-buy`,
        { method: "PUT", ...json({ wantToBuy: true }) },
      );
      expect(res.status).toBe(200);
      const list = await (await app.request("/party/want-to-buy")).json();
      expect(list).toEqual([
        expect.objectContaining({
          broughtBy: "Dave",
          averageScore: 94,
          scoreCount: 1,
          hostScore: null,
          wine: expect.objectContaining({
            winemaker: "Merry Edwards",
            year: 2019,
          }),
        }),
      ]);
    });

    it("produces an attendee PDF", async () => {
      const { party } = await createParty();
      const guest = await join(party.token, "Ana");
      await review(party.token, "A", guest.secret, {
        score: 91,
        answers: { p_earth: ["tar"] },
      });
      const res = await app.request(`/party/${party.id}/pdf`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toContain(
        "Fall Nebbiolo.pdf",
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(1000);
    });
  });

  describe("mystery bottles", () => {
    const post = (path: string, body?: unknown) =>
      app.request(
        path,
        body === undefined ? { method: "POST" } : json2("POST", body),
      );
    const json2 = (method: string, body: unknown) => ({
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    async function mysteryParty() {
      const { res, party } = await createParty({
        bottleIds: [bottleIds[0]],
        guestBottles: [{ mystery: true, broughtBy: "Dave" }],
      });
      expect(res.status).toBe(201);
      const mystery = party.bottles.find(
        (b: { broughtBy: string | null }) => b.broughtBy === "Dave",
      );
      return { party, mystery };
    }

    async function realWine() {
      const maker = await createTestWineMaker(db, "Giacomo Conterno");
      const wine = await createTestWine(db, maker.id, null, "Barolo Cerretta");
      return wine.id;
    }

    it("adds a placeholder wine the host fills in later", async () => {
      const { party, mystery } = await mysteryParty();
      expect(mystery.needsDetails).toBe(true);
      expect(mystery.wine.wineName).toBe("Mystery bottle (Fall Nebbiolo)");
      expect(mystery.wine.winemaker).toBe("Unknown producer");
      const known = party.bottles.find(
        (b: { id: number }) => b.id !== mystery.id,
      );
      expect(known.needsDetails).toBe(false);
      const row = await db
        .selectFrom("bottle")
        .select(["status", "purchasePrice"])
        .where("id", "=", mystery.bottleId)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe("in-tasting");

      const summary = await (await app.request("/party")).json();
      expect(summary[0].needsDetailsCount).toBe(1);
    });

    it("never shows the placeholder to guests, even once revealed", async () => {
      const { party, mystery } = await mysteryParty();
      await post(`/party/${party.id}/reveal/${mystery.id}`);
      const view = await (
        await app.request(`/public/party/${party.token}`)
      ).json();
      const bottle = view.bottles.find(
        (b: { label: string }) => b.label === mystery.label,
      );
      expect(bottle.revealed).toBe(true);
      expect(bottle.wine).toBeNull();
    });

    it("swaps in a wine from the list and removes the placeholder", async () => {
      const { party, mystery } = await mysteryParty();
      const wineId = await realWine();
      const res = await post(
        `/party/${party.id}/bottle/${mystery.id}/details`,
        { wineId, year: 2016 },
      );
      expect(res.status).toBe(200);
      const detail = await res.json();
      const filled = detail.bottles.find(
        (b: { id: number }) => b.id === mystery.id,
      );
      expect(filled.needsDetails).toBe(false);
      expect(filled.wine).toMatchObject({
        wineName: "Barolo Cerretta",
        winemaker: "Giacomo Conterno",
        year: 2016,
      });
      const bottle = await db
        .selectFrom("bottle")
        .select("vintageId")
        .where("id", "=", mystery.bottleId)
        .executeTakeFirstOrThrow();
      expect(bottle.vintageId).toBe(filled.vintageId);
      // The placeholder wine, vintage and producer are gone.
      expect(
        await db
          .selectFrom("wine")
          .select("id")
          .where("name", "like", "Mystery bottle%")
          .execute(),
      ).toHaveLength(0);
      expect(
        await db
          .selectFrom("winemaker")
          .select("id")
          .where("name", "=", "Unknown producer")
          .execute(),
      ).toHaveLength(0);
      // A second fill-in is refused.
      const again = await post(
        `/party/${party.id}/bottle/${mystery.id}/details`,
        { wineId, year: 2016 },
      );
      expect(again.status).toBe(409);
    });

    it("can create a new wine for it", async () => {
      const { party, mystery } = await mysteryParty();
      const res = await post(
        `/party/${party.id}/bottle/${mystery.id}/details`,
        {
          newWine: {
            wine: {
              name: "Pinot Noir Reserve",
              type: "red",
              winemaker: { name: "Fable Farm" },
              country: null,
              region: null,
              grapes: [],
            },
            vintage: { year: 2021, drinkFrom: null, drinkUntil: null },
          },
        },
      );
      expect(res.status).toBe(200);
      const filled = (await res.json()).bottles.find(
        (b: { id: number }) => b.id === mystery.id,
      );
      expect(filled.wine.wineName).toBe("Pinot Noir Reserve");
      expect(filled.needsDetails).toBe(false);
    });

    it("holds back the host's note until the details are filled in", async () => {
      const { party, mystery } = await mysteryParty();
      const host = await (await post(`/party/${party.id}/host-session`)).json();
      await review(party.token, mystery.label, host.secret, {
        score: 92,
        notes: "Dark cherry",
        answers: {},
      });
      const finished = await post(`/party/${party.id}/finish`);
      expect(finished.status).toBe(200);
      const notes = () => db.selectFrom("tastingNote").selectAll().execute();
      expect(await notes()).toHaveLength(0);
      // Still drunk, and the party list says it needs details.
      const row = await db
        .selectFrom("bottle")
        .select("status")
        .where("id", "=", mystery.bottleId)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe("drunk");
      expect(
        (await (await app.request("/party")).json())[0].needsDetailsCount,
      ).toBe(1);

      const wineId = await realWine();
      const res = await post(
        `/party/${party.id}/bottle/${mystery.id}/details`,
        {
          wineId,
          year: 2016,
        },
      );
      expect(res.status).toBe(200);
      const saved = await notes();
      expect(saved).toHaveLength(1);
      expect(saved[0].notes).toContain("Dark cherry");
      const vintage = await db
        .selectFrom("vintage")
        .select("year")
        .where("id", "=", saved[0].vintageId)
        .executeTakeFirstOrThrow();
      expect(vintage.year).toBe(2016);
      expect(
        (await (await app.request("/party")).json())[0].needsDetailsCount,
      ).toBe(0);
    });

    it("cancelling removes the placeholder like any guest bottle", async () => {
      const { party } = await mysteryParty();
      await post(`/party/${party.id}/cancel`);
      expect(
        await db
          .selectFrom("wine")
          .select("id")
          .where("name", "like", "Mystery bottle%")
          .execute(),
      ).toHaveLength(0);
    });

    it("refuses details for a bottle that isn't a mystery", async () => {
      const { party } = await mysteryParty();
      const known = party.bottles.find(
        (b: { needsDetails: boolean }) => !b.needsDetails,
      );
      const res = await post(`/party/${party.id}/bottle/${known.id}/details`, {
        wineId: await realWine(),
        year: 2016,
      });
      expect(res.status).toBe(409);
    });
  });

  describe("tasting formats", () => {
    it("beginner parties rate with reactions and derive tannin and body", async () => {
      const { res, party } = await createParty({
        format: "beginner",
        scoreScale: 5,
      });
      expect(res.status).toBe(201);
      expect(party).toMatchObject({ format: "beginner", scoreScale: 100 });
      expect(party.formatDef.rating.kind).toBe("reaction");

      const view = await (
        await app.request(`/public/party/${party.token}`)
      ).json();
      expect(view.format.steps).toHaveLength(1);

      const ana = await join(party.token, "Ana");
      let r = await review(party.token, "A", ana.secret, {
        score: 95,
        answers: {
          colour: "Red: dark red",
          aroma_earth: ["tar"],
          body: "heavy",
          tannin: "grippy",
          sweetness: "dry",
        },
      });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({
        score: 95,
        tags: ["tar"],
        structure: { body: 5, tannin: 5 },
      });

      r = await review(party.token, "A", ana.secret, { score: 91 });
      expect(r.status).toBe(400); // not one of the reactions
      r = await review(party.token, "A", ana.secret, {
        answers: { colour: "Red: garnet" },
      });
      expect(r.status).toBe(400); // garnet is an advanced shade
      r = await review(party.token, "A", ana.secret, {
        answers: { finish: "long" },
      });
      expect(r.status).toBe(400); // not a beginner question
    });

    it("advanced parties keep the score scale and every answer", async () => {
      const { party } = await createParty({
        format: "advanced",
        scoreScale: 5,
      });
      expect(party).toMatchObject({ format: "advanced", scoreScale: 5 });
      expect(party.formatDef.steps.map((s: { id: string }) => s.id)).toEqual([
        "look",
        "nose",
        "palate",
        "conclusion",
      ]);
      const ana = await join(party.token, "Ana");
      const r = await review(party.token, "A", ana.secret, {
        score: 80,
        answers: {
          colour: "Red: garnet",
          nose_intensity: "pronounced",
          t_red: ["leather", "forest floor"],
          tannin: "medium",
          tannin_feel: ["grippy", "fine-grained"],
          finish: "long",
          quality: "outstanding",
        },
      });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({
        tags: ["leather", "forest floor"],
        structure: { tannin: 3 },
        answers: {
          quality: "outstanding",
          tannin_feel: ["grippy", "fine-grained"],
        },
      });
    });

    it("parties from before formats keep the tags and structure flow", async () => {
      const { party } = await createParty();
      await db
        .updateTable("tastingParty")
        .set({ format: null })
        .where("id", "=", party.id)
        .execute();
      const view = await (
        await app.request(`/public/party/${party.token}`)
      ).json();
      expect(view.format).toBeNull();
      const ana = await join(party.token, "Ana");
      let r = await review(party.token, "A", ana.secret, {
        score: 90,
        tags: ["tar"],
        structure: { tannin: 4 },
      });
      expect(r.status).toBe(200);
      r = await review(party.token, "A", ana.secret, {
        answers: { tannin: "high" },
      });
      expect(r.status).toBe(400);
    });
  });

  describe("pouring one at a time", () => {
    it("shows guests only what's been poured, and finishes cleanly", async () => {
      const maker = await createTestWineMaker(db, "Guest Maker");
      const wine = await createTestWine(db, maker.id, null, "Guest Wine");
      const { party } = await createParty({
        pacing: "sequential",
        guestBottles: [{ wineId: wine.id, year: 2020, broughtBy: "Dave" }],
      });
      expect(party.pacing).toBe("sequential");
      expect(
        party.bottles.every(
          (b: { pouredAt: string | null }) => b.pouredAt === null,
        ),
      ).toBe(true);

      const view = async () =>
        (await (await app.request(`/public/party/${party.token}`)).json())
          .bottles;
      expect(await view()).toEqual([]);

      const ana = await join(party.token, "Ana");
      const [first, second] = party.bottles;
      expect(
        (await review(party.token, first.label, ana.secret, { score: 90 }))
          .status,
      ).toBe(404);
      expect(
        (
          await app.request(`/party/${party.id}/reveal/${first.id}`, {
            method: "POST",
          })
        ).status,
      ).toBe(409);

      const poured = await app.request(`/party/${party.id}/pour/${first.id}`, {
        method: "POST",
      });
      expect(poured.status).toBe(200);
      expect((await view()).map((b: { label: string }) => b.label)).toEqual([
        first.label,
      ]);
      expect(
        (await review(party.token, first.label, ana.secret, { score: 90 }))
          .status,
      ).toBe(200);

      // A bottle added mid-party waits to be poured too.
      const added = await (
        await app.request(`/party/${party.id}/guest-bottle`, {
          method: "POST",
          ...json({ wineId: wine.id, year: 2021, broughtBy: "Hannah" }),
        })
      ).json();
      expect(added.bottles.at(-1).pouredAt).toBeNull();
      expect(await view()).toHaveLength(1);

      // Finish with the rest unpoured: only the poured bottle is drunk.
      await app.request(`/party/${party.id}/finish`, { method: "POST" });
      const statusOf = async (bottleId: number) =>
        (
          await db
            .selectFrom("bottle")
            .select("status")
            .where("id", "=", bottleId)
            .executeTakeFirst()
        )?.status;
      expect(await statusOf(first.bottleId)).toBe("drunk");
      const unpouredCellar = party.bottles.find(
        (b: { id: number; broughtBy: string | null }) =>
          b.id !== first.id && !b.broughtBy,
      );
      if (unpouredCellar)
        expect(await statusOf(unpouredCellar.bottleId)).toBe("stored");
      const unpouredGuests = party.bottles
        .filter(
          (b: { id: number; broughtBy: string | null }) =>
            b.id !== first.id && b.broughtBy,
        )
        .concat([added.bottles.at(-1)]);
      for (const g of unpouredGuests)
        expect(await statusOf(g.bottleId)).toBeUndefined();
      void second;

      // After the party guests see only what was poured.
      expect((await view()).map((b: { label: string }) => b.label)).toEqual([
        first.label,
      ]);
    });

    it("pours everything at once by default", async () => {
      const { party } = await createParty();
      expect(party.pacing).toBe("all");
      expect(
        party.bottles.every(
          (b: { pouredAt: string | null }) => b.pouredAt !== null,
        ),
      ).toBe(true);
    });
  });
});
