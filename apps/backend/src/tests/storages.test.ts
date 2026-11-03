import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTestApp,
  createTestAppWithAuth,
  runMigrations,
  cleanDatabase,
  createTestUser,
  createTestLocation,
} from "./setup";
import { registerStorageRoutes } from "@routes/storages.routes.js";
import { db } from "@utils/database.js";

describe("Storage API", () => {
  let testLocationId: number;

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
      registerStorageRoutes(app);
    });

    it("GET /storage returns 401", async () => {
      const res = await app.request("/storage");
      expect(res.status).toBe(401);
    });

    it("POST /storage returns 401", async () => {
      const res = await app.request("/storage", { method: "POST" });
      expect(res.status).toBe(401);
    });

    it("GET /storage/:id returns 401", async () => {
      const res = await app.request("/storage/1");
      expect(res.status).toBe(401);
    });

    it("PUT /storage/:id returns 401", async () => {
      const res = await app.request("/storage/1", { method: "PUT" });
      expect(res.status).toBe(401);
    });

    it("DELETE /storage/:id returns 401", async () => {
      const res = await app.request("/storage/1", { method: "DELETE" });
      expect(res.status).toBe(401);
    });
  });

  describe("Authenticated operations", () => {
    let app: OpenAPIHono;

    beforeEach(async () => {
      // Create prerequisite data
      const location = await createTestLocation(db, "Cellar");
      testLocationId = location.id;

      app = createTestAppWithAuth();
      registerStorageRoutes(app);
    });

    describe("GET /storage", () => {
      it("returns 200 with empty array", async () => {
        const res = await app.request("/storage");
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
      });
    });

    describe("POST /storage", () => {
      it("returns 400 with invalid data", async () => {
        const res = await app.request("/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invalid: "data" }),
        });
        expect(res.status).toBe(400);
      });

      it("creates a storage with valid data", async () => {
        const res = await app.request("/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Rack A",
            locationId: testLocationId,
            parent: null,
          }),
        });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data).toHaveProperty("id");
        expect(data.name).toBe("Rack A");
        expect(data.capacity).toBeNull();
      });

      it("stores, updates and validates capacity", async () => {
        const post = (body: object) =>
          app.request("/storage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        const res = await post({
          name: "Bin 12",
          locationId: testLocationId,
          parent: null,
          capacity: 24,
        });
        expect(res.status).toBe(201);
        const bin = await res.json();
        expect(bin.capacity).toBe(24);

        const renamed = await (
          await app.request(`/storage/${bin.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Bin 12a" }),
          })
        ).json();
        expect(renamed.capacity).toBe(24); // left alone when not sent

        const cleared = await (
          await app.request(`/storage/${bin.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ capacity: null }),
          })
        ).json();
        expect(cleared.capacity).toBeNull();

        for (const capacity of [0, -3, 2.5]) {
          const bad = await post({
            name: "Bad",
            locationId: testLocationId,
            parent: null,
            capacity,
          });
          expect(bad.status).toBe(400);
        }
      });
    });

    describe("GET /storage/:id", () => {
      it("returns 404 for non-existent storage", async () => {
        const res = await app.request("/storage/999");
        expect(res.status).toBe(404);
      });

      it("returns storage by id", async () => {
        const createRes = await app.request("/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Shelf 1",
            locationId: null,
            parent: null,
          }),
        });
        const created = await createRes.json();

        const res = await app.request(`/storage/${created.id}`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBe(created.id);
        expect(data.name).toBe("Shelf 1");
      });
    });

    describe("invalid ID handling", () => {
      it("GET /storage/:id returns 400 for non-numeric id", async () => {
        const res = await app.request("/storage/abc");
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Invalid ID");
      });

      it("PUT /storage/:id returns 400 for non-numeric id", async () => {
        const res = await app.request("/storage/abc", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test" }),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Invalid ID");
      });

      it("DELETE /storage/:id returns 400 for non-numeric id", async () => {
        const res = await app.request("/storage/abc", { method: "DELETE" });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Invalid ID");
      });
    });

    describe("PUT /storage/:id", () => {
      it("updates a storage", async () => {
        const createRes = await app.request("/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Bin A1",
            locationId: null,
            parent: null,
          }),
        });
        const created = await createRes.json();

        const res = await app.request(`/storage/${created.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Bin A1 (Updated)" }),
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.name).toBe("Bin A1 (Updated)");
      });
    });

    describe("DELETE /storage/:id", () => {
      it("deletes a storage", async () => {
        const createRes = await app.request("/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Box 1",
            locationId: null,
            parent: null,
          }),
        });
        const created = await createRes.json();

        const res = await app.request(`/storage/${created.id}`, {
          method: "DELETE",
        });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ success: true });
      });
    });
  });
});
