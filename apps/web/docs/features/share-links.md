# Shared links

Send someone a link that gives them timed access to your cellar, so they can mark the bottles they'd like opened. For example, family picking what to bring to Thanksgiving.

## Creating a link

Go to **Tools → Shared links → New link** and set:

- **Title**, such as "Thanksgiving".
- **Message** (optional), shown at the top of the shared page.
- **Expiry:** the link works until the end of the chosen day.
- **Bottles each person can mark** (optional). Leave it empty for no limit.

The link page has the URL to copy, plus a share button on phones.

## What people with the link see

No login is needed. They see your **stored** bottles, grouped by wine and vintage, with:

- type, region, country and grapes
- the drinking window, with "Ready to drink", "Still young" or "Past its window"
- your tasting notes for that vintage
- where the bottles are (storage and bin)
- how many are available, and how many are already set aside

They never see prices.

To mark bottles they enter a name, which is remembered in a cookie on their phone. Marking takes one real bottle, the lowest-numbered unmarked one, so your pull list knows exactly which bin to go to. They can unmark their own picks, and a "My picks" filter shows them what they chose.

## Set-aside bottles

- A marked bottle is set aside for **every** link. Other links show it as "set aside", without the name.
- The bottle's status doesn't change; it stays `stored`.
- The bottle page shows a **Set aside** card ("Marked for Thanksgiving, by Sue").
- If a marked bottle leaves storage anyway (drunk, moved to a party), the pull list greys it out as "no longer stored".

## Pull list and managing a link

The link page lists marked bottles grouped by storage path and sorted by bin, so you can walk the cellar once. From there you can:

- **Release** a single bottle.
- **Change expiry**, or **reopen** an expired or closed link with a new date.
- **Close link now**, which stops it working straight away.
- **Delete** the link, which also releases all its marks.

When a link expires or is closed, the page says so, and the marks stay until you release them or delete the link.

## API

Host endpoints (session required): `GET/POST /api/share`, `GET/DELETE /api/share/:id`, `POST /api/share/:id/revoke`, `POST /api/share/:id/extend`, `DELETE /api/share/:id/mark/:markId`, `GET /api/share/bottle/:bottleId`.

Public endpoints (rate limited, token in the path, viewer secret in the `x-share-guest` header): `GET /api/public/share/:token`, `POST …/join`, `POST …/mark`, `DELETE …/mark/:markId`.

These are plain Hono routes like the party routes, so they don't appear in `/api/docs`.
