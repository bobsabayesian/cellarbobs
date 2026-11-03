import { Hono } from "hono";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import * as access from "@controllers/access.controller.js";
import { requireAuth } from "@middleware/auth.middleware.js";
import { requireAdmin } from "@middleware/admin.middleware.js";
import { parseId } from "@utils/id.js";

const grantSchema = z.object({ level: z.enum(["view", "edit"]).nullable() });

/** Admin-only: who can see which storages. */
export function registerAccessRoutes(app: OpenAPIHono) {
  const routes = new Hono();
  routes.use("*", requireAuth, requireAdmin);

  routes.get("/storages", async (c) => c.json(await access.overview()));

  routes.put("/storages/:storageId/users/:userId", async (c) => {
    const storageId = parseId(c.req.param("storageId"));
    if (storageId === null) return c.json({ error: "Invalid ID" }, 400);
    const body = grantSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success)
      return c.json({ error: 'level must be "view", "edit" or null' }, 400);
    await access.setGrant(storageId, c.req.param("userId"), body.data.level);
    return c.json(await access.overview());
  });

  app.route("/access", routes);
}
