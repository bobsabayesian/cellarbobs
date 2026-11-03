# Tasting Parties

Tasting Parties run a blind tasting straight from your cellar. You pick the bottles, guests scan a QR code and rate them on their phones as **Bottle A, B, C…**, and you reveal each one on a main screen. When the party ends, the bottles are marked as drunk and your own blind ratings become tasting notes.

## Hosting a party

1. Open **Tasting Parties → New party**.
2. Give it a title and date, and choose whether guests rate on **100 points** or **5 stars**.
3. Pick bottles from your cellar. Only bottles with the status _stored_ can be picked. They change to **Out (In Tasting)** and drop out of their storage counts until the party ends.
4. Add any **guest bottles** people are bringing (see below). A party has 2–12 bottles in total, from your cellar, from guests, or both.
5. Choose the **pacing**. With **All at once**, guests see every bottle from the start. With **One at a time**, guests see nothing until you pour (below).
6. Select **Start the party**. The labels are shuffled, so A, B and C don't follow the order you picked the bottles in, and don't give away which ones the guests brought.

The party page is your console:

- **QR code / Copy guest link**: guests scan or open it to join. No account is needed, only a nickname.
- **Show pour list**: shows which wine is behind each label, for bagging and pouring. It's hidden by default, so you can taste blind too. Ask someone else to open it and bag the bottles.
- **Rate blind as host**: opens the guest page as you. Your ratings are linked to your account, and a **Host console** button there takes you back.
- **Main screen**: a full-screen view for a TV or laptop. It shows the QR code and, as you reveal bottles, each wine with everyone's scores and guesses.
- **Pour** (one-at-a-time parties): makes a bottle appear on guests' phones, which jump to it with a "Bottle C is poured" banner. Use a bottle's own **Pour** button in any order, or **Pour next** to go in label order. Unpoured bottles are completely hidden from guests, so they don't know how many are coming. They can't be rated or revealed until poured. A guest bottle added mid-party waits to be poured too.
- **Reveal**: unmasks one bottle for everyone, on the main screen and on guests' phones.
- **Someone brought a bottle**: adds a guest bottle while the party is running. It gets the next label (D, E, …) and appears on guests' phones.
- **Remove** (bin icon): takes out a bottle nobody has rated yet. A cellar bottle goes back to its bin.
- **Want to buy**: flags a revealed wine for your shopping list (see below).
- **Download PDF**: the wine list for attendees (see below).
- **Finish party**: every poured bottle becomes _drunk_ on the party date. In a one-at-a-time party, bottles you never poured weren't opened: yours go back to their bins as _stored_, and unopened guest bottles are removed. Yours get the note "Blind tasting: _title_", and guests' bottles also say who brought them. Your own blind reviews are saved as tasting notes on each vintage, and the guest link stops working.
- **Cancel party**: puts your bottles back in their bins as _stored_, and removes guest bottles along with any wines the party created for them.

## Guest bottles

When guests bring wine, add it as a **guest bottle** when you create the party, or mid-party with **Someone brought a bottle**. Enter who brought it, then either:

- **From your wine list**: search for the wine (typos are fine: "bordeax" finds Bordeaux) and enter the vintage year, or tick NV. If you don't have that vintage yet, it's created.
- **New wine**: paste a Vivino or shop link and check what was read from it, or select **Type it in** to fill in the winemaker, name, type, region and grapes yourself. Nothing is created until you start the party.

Each guest bottle gets a real **bottle in your inventory**, marked **Out (In Tasting)**. It has a price of 0 and no storage location, so it doesn't change your cellar value or your bin counts.

- **Finish**: the guest bottle becomes _drunk_ on the party date with the note "Brought by _name_ · Blind tasting: _title_", so it appears in your drinking history. Your blind note lands on its vintage.
- **Cancel, or remove the bottle mid-party**: the guest bottle is deleted. So is any wine, vintage or winemaker the party created for it, unless something else now uses it, such as another bottle or a tasting note.

Guests only see who brought a bottle after it's revealed.

### Want to buy

Liked something a guest brought? Select **Want to buy** on it, once it's revealed or the party has ended. Flagged wines appear in a **Want to buy** list on the Tasting Parties page, with your blind score, the group average and who brought it. The `list_want_to_buy` MCP tool gives assistants the same list.

## Sending the wine list to attendees

**Download PDF** on the party page makes a one-page wine list you can email or print. For each bottle, in label order, it shows:

- the label, the real wine, vintage, type, grapes and region
- who brought it
- the group's average score and range
- each taster's score; untick **Include each taster's score** to leave these out
- the aromas the group picked most often

Personal free-text notes are never included. You can make the PDF at any time. While the party is running it names every wine, including ones you haven't revealed yet, so download it after the last reveal.

## Tasting formats

Each party uses one of two tasting formats, chosen when you create it. Everyone at the party uses the same one, so the results are comparable.

- **Beginner**: one screen. Guests pick the colour they see, tap aromas, choose sweetness, body and tannin ("soft / grippy", reds only), then rate it "loved it", "liked it" or "not for me". Those reactions are stored as 95, 85 and 70, so beginner parties still feed your palate profile.
- **Advanced**: four steps, Look, Nose, Palate and Conclusion, in the style of a systematic tasting:
  - **Look:** clarity, intensity and colour with shade swatches.
  - **Nose:** intensity, plus primary, secondary and tertiary aromas.
  - **Palate:** sweetness, acidity, tannin and alcohol, each with how it feels, then body, flavour intensity, finish length and complexity.
  - **Conclusion:** how it's drinking and its quality, then a score out of 100 or 5 stars.

Answers are shown by their labels in guests' notes PDFs, in your tasting notes, and to assistants through the [MCP server](/features/mcp). Advanced answers also appear in your palate profile, e.g. "Finish length: long" or "Tannin feels: grippy".

### Editing the formats

The questions come from two JSON files, `beginner.json` and `advanced.json`. With the Docker setup in this repo, they're in `deploy/data/tasting-formats/`, and `deploy/tasting-formats.example/` has the defaults. Set `PARTY_FORMATS_DIR` on the backend to keep them somewhere else. Changes apply to the next page load.

A format is a list of `steps`, each holding `blocks` of `fields`. Each field has a `key`, a `label` and a `kind`:

- `"scale"`: pick one `options` entry, listed low to high. Add `"structure": "tannin"` (or `acidity`, `body`, `oak`) to have it feed the 1-5 structure in your palate profile.
- `"multi"`: pick any of the `options`. Add `"tag": true` to count the picks as aroma tags.
- `"colour"`: `families` maps a colour ("Red") to its shades, each with a `label` and a hex `color`.

A block can be `"collapsible": true`, and `"open": true` to start open. `rating` is either `{"kind": "score"}` (the party's 100-point or 5-star scale) or `{"kind": "reaction", "options": [{"label": "loved it", "score": 95}, …]}`.

If a file is invalid, for example duplicate keys or a field without options, CellarBoss uses that format's built-in version and logs why. Changing a question doesn't touch reviews already saved. Keep a field's `key` the same if you only reword its label.

Parties created before formats existed keep their quick-tap tags and acidity/tannin/body/oak sliders, shown exactly as recorded.

## What guests record

For each bottle a guest can enter:

- A **score**, out of 100 or as 1–5 stars. Scores are always stored out of 100, so parties on different scales can be compared.
- **The format's questions**: see [Tasting formats](#tasting-formats). Parties created before formats existed used the quick-tap tags (see [Editing the tags](#editing-the-tags)).
- **Structure**: acidity, tannin, body and oak, each from 1 (low) to 5 (high).
- **Notes**, in free text.
- An optional **guess** of grape, region, country and vintage.

Everything saves as they go. Once a bottle is revealed, guests see the wine and everyone's scores.

**My notes (PDF)** on the guest page downloads a guest's own notes: their score, tags, structure, notes and guesses for each bottle, with the wine once it's revealed. Nobody else's notes are included.

When the party finishes, the guest link keeps working read-only. Guests see every wine, everyone's scores and their own notes, and can still download their notes, but nobody can join or change a rating. A cancelled party's link stops working.

The bottle's own page shows a **Tasting party** card linking to the party, while it's being tasted and afterwards.

## Editing the tags

The quick-tap tags come from a JSON file. Each key is a heading guests see, and its list is the tags under it, in order:

```json
{
  "fruit": ["cherry", "red berry", "plum"],
  "earth": ["tar", "leather", "forest floor"],
  "funk": ["barnyard", "volatile"]
}
```

With the Docker setup in this repo, the file is `deploy/data/tasting-tags.json`. It's created with the defaults on first start; `deploy/tasting-tags.example.json` has them too. Changes apply to the next page load, with no restart. Set `PARTY_TAGS_FILE` on the backend to put the file somewhere else.

If the file isn't valid JSON, or a group is empty, CellarBoss uses the built-in tags and logs why. Removing a tag doesn't change existing reviews that used it. Guests just can't pick it any more.

::: info Sharing the guest link
The guest link contains a long random token, and that token is the only credential. Anyone with the link can join while the party is active, and nobody can once it's finished or cancelled. Guests never see which wine a label is until you reveal it.

If you put Cloudflare Access (or another login) in front of CellarBoss, add a bypass for `/party/*`, or guests won't be able to open the link.
:::

## Your palate

The **Tasting Parties** page summarises your blind ratings. It shows your average score by grape, region, age at tasting, structure and tags, compared with your overall average. It also shows **tasters like you**: guests whose scores track yours. A guest is matched across parties by nickname, and needs at least 3 bottles in common with you.

The same data is available to AI assistants through the [MCP server](/features/mcp), and as an export for your own analysis.

## Exporting for Jupyter

`GET /api/party/export` (logged in) downloads every review of a revealed bottle as CSV. Add `?format=json` for JSON. Each row has the scores, tags, structure, notes and guesses, plus the real wine's winemaker, name, vintage, type, region, country, grapes and age at tasting.

With SQLite you can also read the database directly, read-only:

```python
import sqlite3, pandas as pd

con = sqlite3.connect("file:/path/to/cellarboss.sqlite?mode=ro", uri=True)
reviews = pd.read_sql("""
    select p.title, p.date, pb.label, g.name as taster, g.userId is not null as is_host,
           r.score, r.tags, r.structure, r.guesses, pb.bottleId
    from partyReview r
    join partyBottle pb on pb.id = r.partyBottleId
    join tastingParty p on p.id = r.partyId
    join partyGuest g on g.id = r.guestId
    where p.status = 'finished'
""", con)
```

`tags`, `structure` and `guesses` are JSON strings. Use `pd.json_normalize(reviews.structure.map(json.loads))` to expand them.
