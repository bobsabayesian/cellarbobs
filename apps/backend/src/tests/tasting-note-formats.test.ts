import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTestAppWithAuth,
  runMigrations,
  cleanDatabase,
  createTestUser,
  createTestVintage,
  createTestWine,
  createTestWineMaker,
} from "./setup";
import { registerTastingNoteRoutes } from "@routes/tasting-notes.routes.js";
import { db } from "@utils/database.js";

const json = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("Tasting notes in a party format", () => {
  let app: OpenAPIHono;
  let vintageId: number;

  beforeAll(async () => {
    await runMigrations(db);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    await createTestUser(db);
    const maker = await createTestWineMaker(db, "Ridge");
    const wine = await createTestWine(db, maker.id, null, "Monte Bello");
    vintageId = (await createTestVintage(db, wine.id, 2015)).id;
    app = createTestAppWithAuth();
    registerTastingNoteRoutes(app);
  });

  it("lists the formats with their questions", async () => {
    const res = await app.request("/tasting-note/formats");
    expect(res.status).toBe(200);
    const formats = await res.json();
    expect(formats.map((f: { id: string }) => f.id)).toEqual([
      "beginner",
      "advanced",
    ]);
    expect(formats[0].steps.length).toBeGreaterThan(0);
  });

  it("saves answers with a beginner note and reads them back", async () => {
    const res = await app.request(
      "/tasting-note",
      json("POST", {
        vintageId,
        score: 8,
        notes: "Lovely",
        format: "beginner",
        answers: { tannin: "grippy", body: "heavy" },
      }),
    );
    expect(res.status).toBe(201);
    const note = await res.json();
    expect(note.format).toBe("beginner");
    expect(note.answers).toEqual({ tannin: "grippy", body: "heavy" });

    const all = await (await app.request("/tasting-note")).json();
    expect(all[0].answers.tannin).toBe("grippy");
  });

  it("quick notes and older notes have no answers", async () => {
    const quick = await app.request(
      "/tasting-note",
      json("POST", { vintageId, score: 6, notes: "Fine", format: "quick" }),
    );
    expect(quick.status).toBe(201);
    expect((await quick.json()).answers).toEqual({});

    const plain = await app.request(
      "/tasting-note",
      json("POST", { vintageId, score: 6, notes: "Fine" }),
    );
    const note = await plain.json();
    expect(note.format).toBeNull();
    expect(note.answers).toEqual({});
  });

  it("rejects answers that don't match the format", async () => {
    const bad = await app.request(
      "/tasting-note",
      json("POST", {
        vintageId,
        score: 5,
        notes: "",
        format: "beginner",
        answers: { tannin: "very silky" },
      }),
    );
    expect(bad.status).toBe(400);
    const unknown = await app.request(
      "/tasting-note",
      json("POST", {
        vintageId,
        score: 5,
        notes: "",
        format: "beginner",
        answers: { nonsense: "x" },
      }),
    );
    expect(unknown.status).toBe(400);
    const quick = await app.request(
      "/tasting-note",
      json("POST", {
        vintageId,
        score: 5,
        notes: "",
        format: "quick",
        answers: { tannin: "soft" },
      }),
    );
    expect(quick.status).toBe(400);
  });

  it("updates answers against the note's own format", async () => {
    const created = await (
      await app.request(
        "/tasting-note",
        json("POST", {
          vintageId,
          score: 7,
          notes: "",
          format: "beginner",
          answers: { tannin: "soft" },
        }),
      )
    ).json();
    const res = await app.request(
      `/tasting-note/${created.id}`,
      json("PUT", { answers: { tannin: "grippy" } }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).answers).toEqual({ tannin: "grippy" });
    const bad = await app.request(
      `/tasting-note/${created.id}`,
      json("PUT", { answers: { tannin: "bogus" } }),
    );
    expect(bad.status).toBe(400);
  });
});
