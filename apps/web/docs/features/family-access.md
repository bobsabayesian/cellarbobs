# Family access

One database, shared by the family. The admin decides which users see which storages. Everyone else sees only what they've made or been given.

## The rules

- **The admin sees and edits everything.**
- **Access hangs off storages.** On **Storage access** (Settings, admin only) the admin sets each user to None, View or Edit per storage.
  - Access to a storage covers everything inside it, so sharing a rack shares its shelves. If someone has more than one grant on the way down, the higher one wins.
  - **View** is read-only. **Edit** lets them add, change, move, change the status of and delete bottles there, and edit the storage itself.
  - A user granted only a shelf sees the shelf, not the rack around it.
- **A bottle follows its storage.** If you can see the shelf, you can see its bottles, with the same level. Bottle counts on wine and vintage pages only count bottles you can see.
- **New storages are private.** Whoever adds a storage gets Edit on it, and nobody else sees it until the admin shares it.
- **Moving needs Edit on both ends.** A bottle can only be moved into a storage you can edit.
- **Locations** show up for people who can see a storage in them, and for whoever added them.
- **Tasting notes are shared.** Everyone sees every note on a wine they can see; only the author (or the admin) edits it. View-only users can still write their own notes.

## Personal storage

Bottles with no storage (ordered or pending ones, bottles guests bring to a tasting) go into the user's own storage, named "<name> (unsorted)". It's created the first time it's needed. Other users don't see it, and it can't be shared on the access screen; the admin sees it. Receive the bottle into a real storage from **Pending** to share it.

Deleting a user keeps their personal storage and its bottles, so the admin can tidy up afterwards.

## Parties and links

For now a party or shared link belongs to whoever made it, and the admin sees all. A shared link only shows bottles its creator can see, checked each time it's opened. A party can only pour bottles you can edit. Letting the admin add co-hosts to a party or link is planned.

## Not covered yet

- **The catalog** (wines, winemakers, regions and so on) is still one shared list that everyone sees. Hiding records nobody has bottles of is planned.
- **The edit buttons don't change for View users.** The server refuses with "You have view-only access to this storage".
- **MCP** has no login, so it sees everything. Keep it on localhost.

## Upgrading

Migration 030 adds the access table. Existing bottles with no storage move into the first admin's personal storage; everything else stays visible to the admin. Other accounts start with no access until the admin shares storages with them.
