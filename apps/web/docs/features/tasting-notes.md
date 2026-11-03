# Tasting notes

A tasting note is a score out of 10 and some text for one vintage, written by one person.

## Writing a note

- **From the bottles list:** the notebook icon on each row starts a note for that bottle's wine and vintage. Saving or cancelling brings you back to the list, with your filters.
- **From a wine or vintage page, or Tasting Notes → add:** the same editor. If no vintage is chosen yet, pick the wine and vintage first.

Pick a **style** at the top; the last one you used is remembered on that device.

| Style        | What you fill in                                                           |
| ------------ | -------------------------------------------------------------------------- |
| **Quick**    | A 0-10 score and a text field.                                             |
| **Beginner** | The party's beginner format: simple questions, then how much you liked it. |
| **Advanced** | The party's advanced format: look, nose, palate and verdict, then a score. |

Beginner and advanced use the same question files as Tasting Parties (`PARTY_FORMATS_DIR`, see [parties.md](parties.md)), so editing a file changes both. Notes keep the answers they were saved with, shown as small badges ("Tannin: grippy") under the note. Quick notes and notes from before this feature have no answers.

## Scores

Notes stay on a 0-10 scale. Beginner's "loved it / liked it / not for me" buttons are saved as the nearest whole score (so "loved it" is 10), and an advanced 100-point style isn't used here.

## Editing

Edit keeps the note's original style. You can change the score, text and answers; the style itself is fixed. The answers are checked against the format file, so an answer that's no longer an option in the file is rejected until you pick another.

## API

- `GET /api/tasting-note/formats`: the beginner and advanced definitions.
- `POST /api/tasting-note`: `{ vintageId, score, notes, format?: "quick" | "beginner" | "advanced", answers? }`. Answers need a beginner or advanced format and are validated against it (400 otherwise).
- `PUT /api/tasting-note/:id`: `score`, `notes` and/or `answers`.
