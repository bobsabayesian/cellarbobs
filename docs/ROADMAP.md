# Roadmap

Planned work for this fork, roughly in priority order. Each item notes what it touches, so it can be picked up cold.

## Drinking history view

Consumed bottles are now hidden from everyday views by the **Hide consumed bottles** setting (done). Still to plan: a dedicated view of drunk, sold and gifted bottles, newest first, with the consumed date and note (e.g. "w/Kristen", "Blind tasting: …").

## Done: storage capacity

Storages have an optional capacity (one bottle per slot). Lists show "18 / 24" fill bars, the storages page lists **Room to spare**, and the Receive and Move pickers show free space. Possible follow-up: suggest bins with room for a whole delivery, near where the same wine already sits.

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
