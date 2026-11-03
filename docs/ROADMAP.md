# Roadmap

Planned work for this fork, roughly in priority order. Each item notes what it touches, so it can be picked up cold.

## Done: tasting notes in party formats

Notes can be written in Quick, Beginner or Advanced style (same format files as parties), with a notebook icon on every row of the bottles list. See `apps/web/docs/features/tasting-notes.md`. The MCP tools don't expose the answers, and the "Look" colour answers aren't shown as swatches on notes.

## Done: shared links

Tools → **Shared links** sends someone a timed link to browse the stored cellar (no prices) and mark bottles to set aside, with a pull list sorted by bin. See `apps/web/docs/features/share-links.md`. Possible follow-up: a QR code like parties have.

## Done: consumed bottles

Consumed bottles are hidden from everyday views by the **Hide consumed bottles** setting, and the **Consumed** page (sidebar, under Wines) is the drinking history: newest first, grouped by month, with consumed notes, same-day tasting notes, search, and status and year filters. The sidebar now has a **Wines** section (Bottles, Pending, Consumed, Tasting Notes) with Wines, Grapes and Winemakers under an expandable **Catalog** link.

## Done: storage capacity

Storages have an optional capacity (one bottle per slot). Lists show "18 / 24" fill bars, the storages page lists **Room to spare**, and the Receive and Move pickers show free space. Possible follow-up: suggest bins with room for a whole delivery, near where the same wine already sits.

## Done: tasting formats for parties

Built, with beginner and advanced formats as editable files in `PARTY_FORMATS_DIR`. See `apps/web/docs/features/parties.md` (Tasting formats). Design reference: [`roadmap/tasting-format-beginner.json`](roadmap/tasting-format-beginner.json) and [`roadmap/tasting-format-advanced.json`](roadmap/tasting-format-advanced.json).

## Family access: one database, configurable views

**Goal:** one database for the family. The admin decides which users see which storages, parties and links. Nothing is commercial, so there are no tenants or per-user databases.

**Problem today:** every account sees and changes everything. Only tasting notes (`authorId`), images (`createdBy`) and party hosts (`hostUserId`) record a user.

### Rules

- **Access hangs off storages.** A new `storageAccess(storageId, userId, level)` table, with level `view` or `edit` and one row per user and storage.
  - Access to a storage covers everything under it, so granting a rack grants its shelves. A user granted only a shelf sees it, with its path starting at the shelf they were granted.
  - Whoever creates a storage gets `edit` on it automatically.
  - A bottle follows its storage. `view` means read-only. `edit` means they can add, edit, move, change the status of and delete bottles there. Moving a bottle needs `edit` on both the source and the destination.
  - Locations show up when a visible storage is in them, or the user created them.
- **The admin sees and edits everything.** Grants only limit everyone else. The admin manages access.
- **Bottles with no storage** (ordered or pending, party guest bottles, imported bottles with no location): each user gets a personal storage ("<name>'s unsorted"), created on first need and visible only to them and the admin. Those bottles go there instead of having no storage, and Pending's "receive into storage" moves them out. The migration puts existing storage-less bottles in the admin's personal storage.
- **Catalog** (wines, vintages, winemakers, grapes, regions, countries) stays one shared set. A user sees a record when any of these is true:
  - they can see at least one bottle of it
  - they created it (new `createdBy` column, empty on existing rows)
  - they wrote a tasting note on it

  When someone adds a record that already exists but is hidden from them (for example "Ridge"), the app reuses the existing record instead of failing on a duplicate.

- **Tasting notes are shared:** everyone who can see a vintage sees all its notes. Only the author edits a note, and the admin can edit any. View-only users can still write their own notes.
- **Parties and links** get their own access tables (`partyAccess`, `shareAccess`, same levels). The creator has `edit` automatically, so the admin can add a co-host. A link only shows bottles the link's creator can see, checked each time it's opened. Marks only apply to those bottles.
- **MCP** has no login, so it stays admin-view and localhost-only. This is noted in the docs.
- **Existing data:** all current storages, parties and links go to the admin. Other accounts start with nothing until assigned.

### Steps (each can ship on its own)

**Step 1 is built** (see `apps/web/docs/features/family-access.md`): storage access, personal storages, bottle scoping and the admin screen. Parties and links are visible only to their creator for now. Steps 2 and 3 below remain.

1. **Storage access and bottle scoping.** Migration with `storageAccess` and personal storages. One backend helper, `visibleStorages(user)`, applied to every query that touches bottles or storages: bottles, storages and locations, vintage and wine embedded counts, dashboard and cellar value, Pending, Consumed, capacity, import and the receive and move pickers. Write checks (view vs edit) on bottle and storage mutations. The admin screen assigns each user None, View or Edit per storage, as a tree. It's reachable from the Users page and from each storage's "Who has access".
2. **Catalog visibility.** `createdBy` on the catalog tables, the visibility rule above in the list and detail endpoints, and reuse of hidden duplicates on create.
3. **Parties and links.** The access tables, their admin screens, and links limited to the creator's view.

### Testing

A backend test with at least two users and a shared and a private storage should check, for every list and detail endpoint, that a user sees only their own and shared storages. The same test should check that view-only users can't change anything and that moving between storages needs `edit` on both. Also test the catalog rule (the "created it" case and the hidden-duplicate case) and that a link from one user never shows another user's bottles. Run it on SQLite, and on Postgres and MySQL where available.

### Decided details

- Personal storages are hidden from other users' storage lists. Only the owner and the admin see them.
- Deleting a user keeps their personal storage and its bottles. The admin cleans them up afterwards (moves or removes them); nothing is reassigned automatically.

## Smaller follow-ups noted along the way

- Party and shared-link routes are plain Hono handlers, not OpenAPI routes, so they're missing from `/api/docs`.
- The mobile app (`apps/mobile`) is parked: the plan is to use the website on phones, so it isn't kept up with new features. It still has to compile, since it shares the types, validators and common packages.
- The MCP server has no authentication, so it's localhost or SSH tunnel only. Using it from claude.ai would need auth first.
- The web and common `formatDate` tests fail when the machine's timezone isn't UTC (they pass with `TZ=UTC`).
- One mobile test failed intermittently once and didn't reproduce.
