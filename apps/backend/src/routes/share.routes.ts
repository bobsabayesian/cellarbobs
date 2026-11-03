import { Hono, type Context } from "hono";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ZodType } from "zod";
import {
  createShareLinkSchema,
  extendShareLinkSchema,
  joinShareSchema,
  markShareSchema,
} from "@cellarboss/validators";
import * as share from "@controllers/share.controller.js";
import { ShareError } from "@controllers/share.controller.js";
import { requireAuth } from "@middleware/auth.middleware.js";
import { rateLimit } from "@middleware/rate-limit.middleware.js";
import { parseId } from "@utils/id.js";

/**
 * Shared links. /share/* is the host's (session required); /public/share/*
 * is for people with a link, keyed by its token and rate limited.
 */

type Handler = (c: Context) => Promise<Response>;

function guarded(fn: Handler): Handler {
  return async (c) => {
    try {
      return await fn(c);
    } catch (err) {
      if (err instanceof ShareError)
        return c.json({ error: err.message }, err.status);
      throw err;
    }
  };
}

async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const result = schema.safeParse(await c.req.json().catch(() => undefined));
  if (!result.success)
    throw new ShareError(
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      400,
    );
  return result.data;
}

function id(c: Context, name = "id"): number {
  const value = parseId(c.req.param(name));
  if (value === null) throw new ShareError("Invalid ID", 400);
  return value;
}

export function registerShareRoutes(app: OpenAPIHono) {
  const host = new Hono();
  host.use("*", requireAuth);
  host.get(
    "/",
    guarded(async (c) => c.json(await share.list())),
  );
  host.get(
    "/bottle/:bottleId",
    guarded(async (c) => c.json(await share.marksForBottle(id(c, "bottleId")))),
  );
  host.post(
    "/",
    guarded(async (c) => {
      const data = await body(c, createShareLinkSchema);
      const user = c.get("user" as never) as { id: string };
      return c.json(await share.create(data, user.id), 201);
    }),
  );
  host.get(
    "/:id",
    guarded(async (c) => c.json(await share.getDetail(id(c)))),
  );
  host.post(
    "/:id/revoke",
    guarded(async (c) => c.json(await share.revoke(id(c)))),
  );
  host.post(
    "/:id/extend",
    guarded(async (c) => {
      const { expiresAt } = await body(c, extendShareLinkSchema);
      return c.json(await share.extend(id(c), expiresAt));
    }),
  );
  host.delete(
    "/:id",
    guarded(async (c) => {
      await share.remove(id(c));
      return c.json({ success: true });
    }),
  );
  host.delete(
    "/:id/mark/:markId",
    guarded(async (c) =>
      c.json(await share.releaseMark(id(c), id(c, "markId"))),
    ),
  );
  app.route("/share", host);

  const guest = new Hono();
  const reads = rateLimit({ capacity: 120, refillPerSecond: 2 });
  const writes = rateLimit({ capacity: 60, refillPerSecond: 1 });
  const joins = rateLimit({ capacity: 10, refillPerSecond: 0.05 });
  const token = (c: Context) => c.req.param("token") ?? "";
  const secret = (c: Context) => c.req.header("x-share-guest") || undefined;

  guest.get(
    "/:token",
    reads,
    guarded(async (c) => c.json(await share.sharedCellar(token(c), secret(c)))),
  );
  guest.post(
    "/:token/join",
    joins,
    guarded(async (c) => {
      const { name } = await body(c, joinShareSchema);
      return c.json(await share.join(token(c), name), 201);
    }),
  );
  guest.post(
    "/:token/mark",
    writes,
    guarded(async (c) => {
      const { vintageId } = await body(c, markShareSchema);
      await share.mark(token(c), secret(c), vintageId);
      return c.json(await share.sharedCellar(token(c), secret(c)), 201);
    }),
  );
  guest.delete(
    "/:token/mark/:markId",
    writes,
    guarded(async (c) => {
      await share.unmark(token(c), secret(c), id(c, "markId"));
      return c.json(await share.sharedCellar(token(c), secret(c)));
    }),
  );
  app.route("/public/share", guest);
}
