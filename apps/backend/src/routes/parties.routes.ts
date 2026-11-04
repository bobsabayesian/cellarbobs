import { Hono, type Context } from "hono";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ZodType } from "zod";
import {
  bottleDetailsSchema,
  createPartySchema,
  guestBottleSchema,
  joinPartySchema,
  upsertPartyReviewSchema,
  wantToBuySchema,
} from "@cellarboss/validators";
import { buildGuestSheet, buildPartySheet } from "../party/pdf.js";
import * as parties from "@controllers/parties.controller.js";
import * as palate from "@controllers/palate.controller.js";
import { PartyError } from "@controllers/parties.controller.js";
import { requireAuth } from "@middleware/auth.middleware.js";
import { rateLimit } from "@middleware/rate-limit.middleware.js";
import { parseId } from "@utils/id.js";

/**
 * Party Mode routes. Plain Hono handlers (not OpenAPI routes): responses are
 * nested read models and errors come from PartyError.
 *
 *   /party/*         host, requires a session
 *   /public/party/*  guests, by unguessable token, rate limited
 */

type Handler = (c: Context) => Promise<Response>;

function guarded(fn: Handler): Handler {
  return async (c) => {
    try {
      return await fn(c);
    } catch (err) {
      if (err instanceof PartyError)
        return c.json({ error: err.message }, err.status);
      throw err;
    }
  };
}

async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const json = await c.req.json().catch(() => undefined);
  const result = schema.safeParse(json);
  if (!result.success)
    throw new PartyError(
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      400,
    );
  return result.data;
}

function id(c: Context, name = "id"): number {
  const value = parseId(c.req.param(name));
  if (value === null) throw new PartyError("Invalid ID", 400);
  return value;
}

function token(c: Context): string {
  return c.req.param("token") ?? "";
}

function user(c: Context) {
  return c.get("user" as never) as { id: string; name: string };
}

export function registerPartyRoutes(app: OpenAPIHono) {
  const host = new Hono();
  host.use("*", requireAuth);

  host.get(
    "/",
    guarded(async (c) => c.json(await parties.list())),
  );

  // Static paths before /{id} so they aren't parsed as ids.
  host.get(
    "/export",
    guarded(async (c) => {
      if (c.req.query("format") === "json")
        return c.json(await parties.reviewRows());
      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header(
        "Content-Disposition",
        'attachment; filename="cellarboss-party-reviews.csv"',
      );
      return c.body(await parties.exportCsv());
    }),
  );

  host.get(
    "/bottle/:bottleId",
    guarded(async (c) =>
      c.json(await parties.partiesForBottle(id(c, "bottleId"))),
    ),
  );

  host.get(
    "/want-to-buy",
    guarded(async (c) => c.json(await parties.wantToBuyList())),
  );

  host.get(
    "/palate",
    guarded(async (c) => c.json(await palate.summary(user(c).id))),
  );

  host.post(
    "/:id/bottle/:partyBottleId/details",
    guarded(async (c) => {
      const details = await body(c, bottleDetailsSchema);
      return c.json(
        await parties.fillDetails(id(c), id(c, "partyBottleId"), details),
      );
    }),
  );

  host.post(
    "/",
    guarded(async (c) => {
      const data = await body(c, createPartySchema);
      return c.json(await parties.create(data, user(c)), 201);
    }),
  );

  host.get(
    "/:id",
    guarded(async (c) => c.json(await parties.getDetail(id(c)))),
  );

  host.get(
    "/:id/pdf",
    guarded(async (c) => {
      const party = await parties.getDetail(id(c));
      const pdf = await buildPartySheet(party, {
        includeScores: c.req.query("scores") !== "0",
      });
      const name = party.title.replace(/[^\w\- ]+/g, "").trim() || "tasting";
      c.header("Content-Type", "application/pdf");
      c.header("Content-Disposition", `attachment; filename="${name}.pdf"`);
      return c.body(new Uint8Array(pdf));
    }),
  );

  host.post(
    "/:id/guest-bottle",
    guarded(async (c) => {
      const data = await body(c, guestBottleSchema);
      return c.json(await parties.addGuestBottle(id(c), data), 201);
    }),
  );
  host.delete(
    "/:id/bottle/:partyBottleId",
    guarded(async (c) =>
      c.json(await parties.removeBottle(id(c), id(c, "partyBottleId"))),
    ),
  );
  host.put(
    "/:id/bottle/:partyBottleId/want-to-buy",
    guarded(async (c) => {
      const { wantToBuy } = await body(c, wantToBuySchema);
      return c.json(
        await parties.setWantToBuy(id(c), id(c, "partyBottleId"), wantToBuy),
      );
    }),
  );

  host.post(
    "/:id/pour/:partyBottleId",
    guarded(async (c) =>
      c.json(await parties.pour(id(c), id(c, "partyBottleId"))),
    ),
  );
  host.post(
    "/:id/reveal/:partyBottleId",
    guarded(async (c) =>
      c.json(await parties.reveal(id(c), id(c, "partyBottleId"))),
    ),
  );
  host.post(
    "/:id/finish",
    guarded(async (c) => c.json(await parties.finish(id(c)))),
  );
  host.post(
    "/:id/cancel",
    guarded(async (c) => c.json(await parties.cancel(id(c)))),
  );
  host.post(
    "/:id/host-session",
    guarded(async (c) => c.json(await parties.hostSession(id(c), user(c).id))),
  );

  app.route("/party", host);

  const guest = new Hono();
  const reads = rateLimit({ capacity: 120, refillPerSecond: 2 });
  const writes = rateLimit({ capacity: 60, refillPerSecond: 1 });
  const joins = rateLimit({ capacity: 10, refillPerSecond: 0.05 });
  const secret = (c: Context) => c.req.header("x-party-guest") || undefined;

  guest.get(
    "/:token",
    reads,
    guarded(async (c) => c.json(await parties.publicView(token(c)))),
  );
  guest.post(
    "/:token/join",
    joins,
    guarded(async (c) => {
      const { name } = await body(c, joinPartySchema);
      return c.json(await parties.join(token(c), name), 201);
    }),
  );
  guest.get(
    "/:token/me",
    reads,
    guarded(async (c) => c.json(await parties.myReviews(token(c), secret(c)))),
  );
  guest.get(
    "/:token/me/pdf",
    reads,
    guarded(async (c) => {
      const { party, guestId } = await parties.guestNotes(token(c), secret(c));
      const pdf = await buildGuestSheet(party, guestId);
      const name = party.title.replace(/[^\w\- ]+/g, "").trim() || "tasting";
      c.header("Content-Type", "application/pdf");
      c.header(
        "Content-Disposition",
        `attachment; filename="${name} - my notes.pdf"`,
      );
      return c.body(new Uint8Array(pdf));
    }),
  );
  guest.put(
    "/:token/review/:label",
    writes,
    guarded(async (c) => {
      const data = await body(c, upsertPartyReviewSchema);
      return c.json(
        await parties.upsertReview(
          token(c),
          secret(c),
          c.req.param("label") ?? "",
          data,
        ),
      );
    }),
  );

  app.route("/public/party", guest);
}
