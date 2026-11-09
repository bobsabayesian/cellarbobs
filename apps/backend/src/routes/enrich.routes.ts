import { Hono, type Context } from "hono";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import * as enrich from "@controllers/enrich.controller.js";
import * as vintages from "@controllers/vintages.controller.js";
import { requireAuth } from "@middleware/auth.middleware.js";
import { requireAdmin } from "@middleware/admin.middleware.js";
import { parseId } from "@utils/id.js";
import { GeminiError } from "../enrich/gemini.js";

const runSchema = z.object({ onlyMissing: z.boolean().default(true) });

function fail(c: Context, err: unknown) {
  if (err instanceof enrich.EnrichError)
    return c.json({ error: err.message }, err.status);
  if (err instanceof GeminiError)
    return c.json({ error: `Gemini: ${err.message}` }, 502);
  throw err;
}

/**
 * Wine data looked up online. Anyone who can see a vintage can read its
 * lookup; looking things up costs API calls, so only an admin can.
 */
export function registerEnrichRoutes(app: OpenAPIHono) {
  const routes = new Hono();
  routes.use("*", requireAuth);

  routes.get("/vintage/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Invalid ID" }, 400);
    if (!(await vintages.getById(id)))
      return c.json({ error: "Not found" }, 404);
    return c.json(await enrich.getEnrichment(id));
  });

  routes.post("/vintage/:id", requireAdmin, async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Invalid ID" }, 400);
    try {
      return c.json(await enrich.enrichVintage(id));
    } catch (err) {
      return fail(c, err);
    }
  });

  routes.get("/status", requireAdmin, async (c) =>
    c.json(await enrich.getStatus()),
  );

  routes.post("/runs", requireAdmin, async (c) => {
    const body = runSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success)
      return c.json({ error: "onlyMissing must be a boolean" }, 400);
    try {
      const user = c.get("user" as never) as { id: string };
      const run = await enrich.startRun(user.id, body.data.onlyMissing);
      return c.json(run, 202);
    } catch (err) {
      return fail(c, err);
    }
  });

  routes.post("/runs/cancel", requireAdmin, async (c) =>
    c.json(await enrich.cancelRun()),
  );

  routes.post("/windows/fill", requireAdmin, async (c) =>
    c.json(await enrich.fillWindows()),
  );

  app.route("/enrich", routes);
}
