import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as storagesController from "@controllers/storages.controller.js";
import * as locationsController from "@controllers/locations.controller.js";
import * as tastingNotesController from "@controllers/tasting-notes.controller.js";
import {
  listEnrichedWines,
  getEnrichedWine,
  listEnrichedBottles,
  getEnrichedBottle,
} from "./queries.js";
import * as partiesController from "@controllers/parties.controller.js";
import * as palateController from "@controllers/palate.controller.js";
import { PartyError } from "@controllers/parties.controller.js";
import { env } from "@utils/env.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function notFoundResult(entity: string, id: number) {
  return {
    content: [{ type: "text" as const, text: `${entity} ${id} not found` }],
    isError: true,
  };
}

const readOnly = { readOnlyHint: true };

/** The guest join token is a credential; MCP clients never need it. */
function withoutToken<T extends { token: string }>(party: T): Omit<T, "token"> {
  const copy: Partial<T> = { ...party };
  delete copy.token;
  return copy as Omit<T, "token">;
}

// A fresh McpServer must be created per request rather than shared as a
// singleton: the SDK's Protocol.connect() throws if called on an instance
// that's already connected to a transport, and a shared instance would let
// concurrent requests race on internal request-id bookkeeping.
export function createMcpServer() {
  const mcpServer = new McpServer({
    name: "cellarboss",
    version: env.APP_VERSION,
  });

  mcpServer.registerTool(
    "list_bottles",
    {
      description:
        "List every bottle in the cellar inventory, with the wine/vintage it holds and its resolved storage location embedded (storagePath and location) rather than raw ids",
      annotations: readOnly,
    },
    async () => jsonResult(await listEnrichedBottles()),
  );

  mcpServer.registerTool(
    "get_bottle",
    {
      description:
        "Get a single bottle by its id, with the wine/vintage it holds and its resolved storage location embedded (storagePath and location) rather than raw ids",
      inputSchema: { id: z.number().int() },
      annotations: readOnly,
    },
    async ({ id }) => {
      const bottle = await getEnrichedBottle(id);
      return bottle ? jsonResult(bottle) : notFoundResult("Bottle", id);
    },
  );

  mcpServer.registerTool(
    "list_wines",
    {
      description:
        "List every wine, one row per vintage, with winemaker, region/country, grape varieties, drinking window, bottle counts by status, and tasting note averageScore/noteCount embedded. The id field is the vintage id. Use the tasting-note tools to read the actual note text",
      annotations: readOnly,
    },
    async () => jsonResult(await listEnrichedWines()),
  );

  mcpServer.registerTool(
    "get_wine",
    {
      description:
        "Get a single wine at a specific vintage, with winemaker, region/country, grape varieties, drinking window, bottle counts by status, and tasting note averageScore/noteCount embedded. id is the vintage id, as returned by list_wines. Use the tasting-note tools to read the actual note text",
      inputSchema: { id: z.number().int() },
      annotations: readOnly,
    },
    async ({ id }) => {
      const wine = await getEnrichedWine(id);
      return wine ? jsonResult(wine) : notFoundResult("Wine", id);
    },
  );

  mcpServer.registerTool(
    "list_storages",
    {
      description:
        "List every storage unit (the physical cellar, rack, or fridge a bottle is kept in)",
      annotations: readOnly,
    },
    async () => jsonResult(await storagesController.list()),
  );

  mcpServer.registerTool(
    "get_storage",
    {
      description: "Get a single storage unit by its id",
      inputSchema: { id: z.number().int() },
      annotations: readOnly,
    },
    async ({ id }) => {
      const storage = await storagesController.getById(id);
      return storage ? jsonResult(storage) : notFoundResult("Storage", id);
    },
  );

  mcpServer.registerTool(
    "list_locations",
    {
      description:
        "List every location (the site or address a storage unit is located at)",
      annotations: readOnly,
    },
    async () => jsonResult(await locationsController.list()),
  );

  mcpServer.registerTool(
    "get_location",
    {
      description: "Get a single location by its id",
      inputSchema: { id: z.number().int() },
      annotations: readOnly,
    },
    async ({ id }) => {
      const location = await locationsController.getById(id);
      return location ? jsonResult(location) : notFoundResult("Location", id);
    },
  );

  mcpServer.registerTool(
    "list_tasting_notes",
    {
      description:
        "List every tasting note (score 0-10 and free-text notes) across the whole cellar, with the author's name embedded and vintageId linking back to the tasted wine",
      annotations: readOnly,
    },
    async () => jsonResult(await tastingNotesController.list()),
  );

  mcpServer.registerTool(
    "get_tasting_note",
    {
      description: "Get a single tasting note by its id",
      inputSchema: { id: z.number().int() },
      annotations: readOnly,
    },
    async ({ id }) => {
      const note = await tastingNotesController.getById(id);
      return note ? jsonResult(note) : notFoundResult("Tasting note", id);
    },
  );

  mcpServer.registerTool(
    "get_tasting_notes_for_vintage",
    {
      description:
        "List every tasting note recorded for a specific vintage. id is the vintage id, as returned by list_wines/get_wine",
      inputSchema: { id: z.number().int() },
      annotations: readOnly,
    },
    async ({ id }) =>
      jsonResult(await tastingNotesController.getByVintageId(id)),
  );

  mcpServer.registerTool(
    "get_tasting_notes_for_wine",
    {
      description:
        "List every tasting note recorded across all vintages of a wine. id is the wineId field returned by list_wines/get_wine",
      inputSchema: { id: z.number().int() },
      annotations: readOnly,
    },
    async ({ id }) => jsonResult(await tastingNotesController.getByWineId(id)),
  );

  // --- Party Mode: blind tastings and the palate profile -------------------

  mcpServer.registerTool(
    "list_tasting_parties",
    {
      description:
        "List blind tasting parties (newest first) with their date, status (active/finished/cancelled), score scale and counts of bottles, guests and reviews",
      annotations: readOnly,
    },
    async () => jsonResult((await partiesController.list()).map(withoutToken)),
  );

  mcpServer.registerTool(
    "get_tasting_party",
    {
      description:
        "Get one blind tasting party: each bottle's blind label (A, B, ...) with the real wine behind it (bottleId null and broughtBy set when a guest brought it; wantToBuy when the owner flagged it), every guest, and every review (score out of 100, tags, structure 1-5 for acidity/tannin/body/oak, notes, guesses, and answers keyed by the party's tasting format, whose questions are in formatDef). Guests with isHost true are the cellar owner",
      inputSchema: { id: z.number().int() },
      annotations: readOnly,
    },
    async ({ id }) => {
      try {
        return jsonResult(withoutToken(await partiesController.getDetail(id)));
      } catch (err) {
        if (err instanceof PartyError) return notFoundResult("Party", id);
        throw err;
      }
    },
  );

  mcpServer.registerTool(
    "list_want_to_buy",
    {
      description:
        "Wines from blind tasting parties the cellar owner flagged as 'want to buy' (usually bottles guests brought), with who brought each, the owner's blind score and the group average (out of 100). Use for shopping lists or 'what was that wine Dave brought?'",
      annotations: readOnly,
    },
    async () => jsonResult(await partiesController.wantToBuyList()),
  );

  mcpServer.registerTool(
    "get_palate_profile",
    {
      description:
        "The cellar owner's palate from blind tastings: mean blind score (out of 100) grouped by wine type, country, region, grape, age at tasting, structure level (e.g. 'tannin: high'), tasting tag, and byAttribute: answers from the beginner/advanced tasting formats (e.g. 'Finish length: long', 'Tannin feels: grippy'). delta is the difference from the owner's overall mean, so positive means they score that group higher than usual. Optional filters narrow the reviews first, e.g. grape 'Nebbiolo' with minAge 6 for older Barolo/Barbaresco",
      inputSchema: {
        grape: z.string().optional(),
        region: z.string().optional(),
        country: z.string().optional(),
        type: z.string().optional(),
        minAge: z.number().int().optional(),
        maxAge: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async (filter) =>
      jsonResult(await palateController.profile(undefined, filter)),
  );

  mcpServer.registerTool(
    "get_taster_calibration",
    {
      description:
        "How each guest's blind scores line up with the cellar owner's on the same bottles (needs 3+ shared bottles): Pearson correlation, mean offset (positive = scores higher than the owner), mean absolute error and a suggested weight (0-1) for trusting their scores",
      annotations: readOnly,
    },
    async () => jsonResult(await palateController.calibration()),
  );

  mcpServer.registerTool(
    "get_guess_accuracy",
    {
      description:
        "Blind guessing accuracy per field (grape, region, country, vintage within one year), for everyone or for one taster by name",
      inputSchema: { taster: z.string().optional() },
      annotations: readOnly,
    },
    async ({ taster }) =>
      jsonResult(await palateController.accuracy(undefined, taster)),
  );

  return mcpServer;
}
