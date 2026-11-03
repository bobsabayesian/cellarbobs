import { describe, it, expect, beforeEach, beforeAll } from "vitest";
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
import { registerBottleRoutes } from "@routes/bottles.routes.js";
import { db } from "@utils/database.js";

describe("Bottle API", () => {
  let testVintageId: number;

  beforeAll(async () => {
    await runMigrations(db);
    await cleanDatabase(db);
    // Created storages and locations record who made them (a real user).
    await createTestUser(db);
  });

  describe("without auth", () => {
    let app: OpenAPIHono;

    beforeEach(() => {
      app = createTestApp();
      registerBottleRoutes(app);
    });

    it("GET /bottle returns 401", async () => {
      const res = await app.request("/bottle");
      expect(res.status).toBe(401);
    });

    it("POST /bottle returns 401", async () => {
      const res = await app.request("/bottle", { method: "POST" });
      expect(res.status).toBe(401);
    });

    it("GET /bottle/:id returns 401", async () => {
      const res = await app.request("/bottle/1");
      expect(res.status).toBe(401);
    });

    it("PUT /bottle/:id returns 401", async () => {
      const res = await app.request("/bottle/1", { method: "PUT" });
      expect(res.status).toBe(401);
    });

    it("DELETE /bottle/:id returns 401", async () => {
      const res = await app.request("/bottle/1", { method: "DELETE" });
      expect(res.status).toBe(401);
    });
  });

  describe("Authenticated operations", () => {
    let app: OpenAPIHono;

    beforeEach(async () => {
      // Create prerequisite data
      const wineMaker = await createTestWineMaker(db, "Domaine Test");
      const wine = await createTestWine(
        db,
        wineMaker.id,
        null,
        "Test Vintage Wine",
      );
      const vintage = await createTestVintage(db, wine.id, 2020);
      testVintageId = vintage.id;

      app = createTestAppWithAuth();
      registerBottleRoutes(app);
    });

    describe("GET /bottle", () => {
      it("returns 200 with empty array", async () => {
        const res = await app.request("/bottle");
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
      });
    });

    describe("POST /bottle", () => {
      it("returns 400 with invalid data", async () => {
        const res = await app.request("/bottle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invalid: "data" }),
        });
        expect(res.status).toBe(400);
      });

      it("creates a bottle with valid data", async () => {
        const res = await app.request("/bottle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseDate: "2024-01-01",
            purchasePrice: 50.0,
            vintageId: testVintageId,
            storageId: null,
            status: "stored",
            size: "standard",
          }),
        });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data).toHaveProperty("id");
        expect(data.purchasePrice).toBe(50.0);
        expect(data.status).toBe("stored");
        expect(data.consumedDate).toBeNull();
        expect(data.consumedNote).toBeNull();
      });

      it("stores consumed date and note", async () => {
        const res = await app.request("/bottle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseDate: "2020-03-01",
            purchasePrice: 30,
            vintageId: testVintageId,
            storageId: null,
            status: "drunk",
            size: "standard",
            consumedDate: "2024-12-25",
            consumedNote: "Christmas dinner",
          }),
        });
        expect(res.status).toBe(201);
        const created = await res.json();
        expect(created.consumedDate).toBe("2024-12-25");
        expect(created.consumedNote).toBe("Christmas dinner");

        const updateRes = await app.request(`/bottle/${created.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "stored" }),
        });
        expect(updateRes.status).toBe(200);
        const updated = await updateRes.json();
        // Fields not sent in a partial update are left alone
        expect(updated.consumedDate).toBe("2024-12-25");

        const clearRes = await app.request(`/bottle/${created.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consumedDate: null, consumedNote: null }),
        });
        const cleared = await clearRes.json();
        expect(cleared.consumedDate).toBeNull();
        expect(cleared.consumedNote).toBeNull();
      });

      it("rejects an invalid consumed date", async () => {
        const res = await app.request("/bottle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseDate: "2024-01-01",
            purchasePrice: 50,
            vintageId: testVintageId,
            storageId: null,
            status: "drunk",
            size: "standard",
            consumedDate: "last tuesday",
          }),
        });
        expect(res.status).toBe(400);
      });
    });

    describe("GET /bottle/:id", () => {
      it("returns 404 for non-existent bottle", async () => {
        const res = await app.request("/bottle/999");
        expect(res.status).toBe(404);
      });

      it("returns bottle by id", async () => {
        const createRes = await app.request("/bottle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseDate: "2024-01-01",
            purchasePrice: 50.0,
            vintageId: testVintageId,
            storageId: null,
            status: "stored",
            size: "standard",
          }),
        });
        const created = await createRes.json();

        const res = await app.request(`/bottle/${created.id}`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBe(created.id);
      });
    });

    describe("invalid ID handling", () => {
      it("GET /bottle/:id returns 400 for non-numeric id", async () => {
        const res = await app.request("/bottle/abc");
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Invalid ID");
      });

      it("PUT /bottle/:id returns 400 for non-numeric id", async () => {
        const res = await app.request("/bottle/abc", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchasePrice: 50 }),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Invalid ID");
      });

      it("DELETE /bottle/:id returns 400 for non-numeric id", async () => {
        const res = await app.request("/bottle/abc", { method: "DELETE" });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Invalid ID");
      });
    });

    describe("GET /bottle/vintage/:vintageId", () => {
      it("returns 400 for non-numeric vintageId", async () => {
        const res = await app.request("/bottle/vintage/abc");
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Invalid ID");
      });

      it("returns empty array for vintage with no bottles", async () => {
        const res = await app.request(`/bottle/vintage/${testVintageId}`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
      });

      it("returns bottles for a vintage", async () => {
        await app.request("/bottle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseDate: "2024-01-01",
            purchasePrice: 50.0,
            vintageId: testVintageId,
            storageId: null,
            status: "stored",
            size: "standard",
          }),
        });

        const res = await app.request(`/bottle/vintage/${testVintageId}`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.length).toBeGreaterThan(0);
        expect(data[0].vintageId).toBe(testVintageId);
      });
    });

    describe("GET /bottle/vintage/:vintageId/counts", () => {
      it("returns 400 for non-numeric vintageId", async () => {
        const res = await app.request("/bottle/vintage/abc/counts");
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Invalid ID");
      });

      it("returns counts for a vintage", async () => {
        const res = await app.request(
          `/bottle/vintage/${testVintageId}/counts`,
        );
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
      });
    });

    describe("PUT /bottle/:id", () => {
      it("updates a bottle", async () => {
        const createRes = await app.request("/bottle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseDate: "2024-01-01",
            purchasePrice: 50.0,
            vintageId: testVintageId,
            storageId: null,
            status: "stored",
            size: "standard",
          }),
        });
        const created = await createRes.json();

        const res = await app.request(`/bottle/${created.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchasePrice: 75.0, status: "drunk" }),
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.purchasePrice).toBe(75.0);
        expect(data.status).toBe("drunk");
      });
    });

    describe("DELETE /bottle/:id", () => {
      it("deletes a bottle", async () => {
        const createRes = await app.request("/bottle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseDate: "2024-01-01",
            purchasePrice: 50.0,
            vintageId: testVintageId,
            storageId: null,
            status: "stored",
            size: "standard",
          }),
        });
        const created = await createRes.json();

        const res = await app.request(`/bottle/${created.id}`, {
          method: "DELETE",
        });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ success: true });
      });
    });
  });
});
