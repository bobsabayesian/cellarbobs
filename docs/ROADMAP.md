# Roadmap

Planned work for this fork, roughly in priority order. Each item notes what it touches, so it can be picked up cold.

## Consumed bottles out of everyday views

**Problem:** since the CellarTracker import, about 700 of the 1,253 bottles are drunk, gifted or sold. They crowd lists that are mostly about what's in the cellar now. Storage pages already count only `stored` bottles (`apps/web/app/storages/[id]/page.tsx`). Other views don't filter.

**Plan:**

- **Bottles list** (`apps/web/app/bottles/page.tsx`): default the existing Status filter to the bottles you still have (`stored`, `in-tasting`, `ordered`, `in-primeur`), with a one-click "Include consumed". The filter already lives in the URL (`urlParamName: "status"`), so it's only a default value plus a toggle, and links can still ask for everything.
- **Wine and vintage pages** (`apps/web/app/wines/[id]`, `apps/web/app/vintages/[id]`): show bottles you have first (vintages already sort `stored` first). Collapse consumed ones into "N past bottles", expandable, showing their consumed date and note.
- **Global setting (decided):** "hide consumed bottles" is an app-wide default in **Application Settings**, stored with the other settings in the `setting` table, not a per-user preference. Every view follows it. The per-view "Include consumed" toggle overrides it only for that visit.
- **Drinking history (decided):** consumed bottles get their own dedicated view, to be planned separately. At minimum it shows consumed bottles newest first, with the consumed date and note (e.g. "w/Kristen", "Blind tasting: …").
- **Dashboard and mobile:** check which counts and lists include consumed bottles, and make each choice deliberate. The mobile app (`apps/mobile`) has its own bottle lists.

## Storage capacity, to see where to slot bottles

**Problem:** when receiving pending bottles, or bottles coming back from a cancelled party, there's no way to see which bins have room.

**Plan:**

- **Data:** add a nullable `capacity` (integer, in bottles) to `storage`. Migration plus `packages/types/src/storage.ts`, the validators, and the storage form fields in web and mobile.
- **Fill level:** show "18 / 24" and a small fill bar on storage pages and in the storage hierarchy. A parent without its own capacity shows the sum of its children.
- **Free slots:** a "Free space" view listing bins with room, most free first. Picking a bin in the **Receive** dialog (`components/bottles/ReceiveBottlesDialog.tsx`), **Move bottle**, and the bottle form shows each bin's free space. Bins without enough room for the selection are flagged, not blocked.
- **Suggestion:** when receiving N bottles, suggest bins with room for all of them, nearest to where the same wine already sits.
- **Slots (decided):** one bottle is one slot, whatever its size.

## Done: tasting formats for parties

Built, with beginner and advanced formats as editable files in `PARTY_FORMATS_DIR`. See `apps/web/docs/features/parties.md` (Tasting formats). Design reference: [`roadmap/tasting-format-beginner.json`](roadmap/tasting-format-beginner.json) and [`roadmap/tasting-format-advanced.json`](roadmap/tasting-format-advanced.json).

## Separate cellars per user

**Problem:** accounts share one cellar. The only role difference is that admins manage users and application settings (`apps/backend/src/routes/users.routes.ts`, `settings.routes.ts`). Bottles, wines, storages and locations have no owner, so anyone you add sees and can change everything. Only tasting notes (`authorId`), images (`createdBy`) and party hosts (`hostUserId`) record a user.

**Plan:**

- **Owned vs shared:** bottles, storages and locations get an owner (`ownerId` → `user.id`). Wines, vintages, winemakers, grapes, regions and countries stay a shared catalogue, so two people with the same wine don't duplicate it.
- **Scoping:** every bottle, storage and location list, count and detail is scoped to the logged-in user, along with the dashboard, Pending, bottle counts on wine and vintage pages, cellar value, and storage capacity once that exists. Reading or changing someone else's bottle returns 404.
- **Parties:** a host pours only their own bottles. Guest bottles become the host's. Palate stats are already per host.
- **Imports:** the CellarTracker importer takes the owner as an argument (`--owner <email>`).
- **MCP:** the server has no authentication, so it can't tell users apart. It needs a per-user token or an owner setting before multi-user is safe there.
- **Migration:** existing bottles, storages and locations go to the first admin, so nothing changes for the current cellar.
- **Open questions:**
  - Should a household be able to share one cellar between several users ("members of a cellar") instead of strictly one owner?
  - Do admins see every cellar, or only their own?
- **Size:** large. It touches nearly every backend query plus the web and mobile lists, so it needs its own plan and a thorough test pass, including Postgres and MySQL.
- **Stopgap if needed sooner:** a second CellarBoss instance with its own database and hostname on the same tunnel.

## Smaller follow-ups noted along the way

- Commit and push the `feat/bottle-consumed-fields` branch, split into logical commits.
- Party routes are plain Hono handlers, not OpenAPI routes, so they're missing from `/api/docs`.
- The mobile app doesn't show the bottle consumed fields or Party Mode yet.
- The MCP server has no authentication, so it's localhost or SSH tunnel only. Using it from claude.ai would need auth first.
- The web and common `formatDate` tests fail when the machine's timezone isn't UTC (they pass with `TZ=UTC`).
- One mobile test failed intermittently once and didn't reproduce.
