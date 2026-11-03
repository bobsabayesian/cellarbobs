import PDFDocument from "pdfkit";
import type { PartyDetail } from "@cellarboss/types";
import { foldKey, stripDiacritics } from "../import/normalise/text.js";
import { describeAnswers, reactionFor } from "./formats.js";

/**
 * The wine list attendees get after a tasting: every bottle with its label,
 * the real wine, who brought it, and how the group scored it. Free-text notes
 * stay out of it; they were written for the taster, not for sending around.
 */

export interface SheetOptions {
  /** Include each taster's score, not just the group average. */
  includeScores: boolean;
}

// Characters Windows-1252 has above 0x7F that the PDF standard fonts can draw.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Keeps text drawable in the built-in Helvetica (WinAnsi encoding). */
export function pdfSafe(text: string): string {
  return [...text.normalize("NFC")]
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if (
        code < 0x80 ||
        (code >= 0xa0 && code <= 0xff) ||
        WIN_ANSI_EXTRA.has(ch)
      )
        return ch;
      const plain = stripDiacritics(ch);
      return [...plain].every((c) => c.codePointAt(0)! < 0x80) ? plain : "?";
    })
    .join("");
}

/** "Winemaker Wine", without repeating a producer the wine is named after. */
export function displayName(winemaker: string, wine: string): string {
  const maker = foldKey(winemaker);
  const name = foldKey(wine);
  return name === maker || name.startsWith(`${maker} `)
    ? wine
    : `${winemaker} ${wine}`;
}

/** A score as the party shows it: a reaction word, stars or points. */
function partyScore(score: number | null, party: PartyDetail): string {
  const reaction = party.formatDef ? reactionFor(party.formatDef, score) : null;
  return reaction ?? scoreText(score, party.scoreScale);
}

function scoreText(score: number | null, scale: 100 | 5): string {
  if (score === null) return "-";
  return scale === 5
    ? `${Math.round(score / 20)}/5`
    : String(Math.round(score));
}

function topTags(tagLists: string[][], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const tags of tagLists)
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function buildPartySheet(
  party: PartyDetail,
  options: SheetOptions,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 54, bottom: 54, left: 60, right: 60 },
    info: { Title: pdfSafe(party.title), Creator: "CellarBoss" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );

  const width = doc.page.width - 120;
  const muted = "#6b7280";
  const guestName = new Map(party.guests.map((g) => [g.id, g.name]));
  const poured = party.bottles.filter((b) => b.pouredAt !== null).length;
  const tasters = party.guests.filter((g) =>
    party.reviews.some((r) => r.guestId === g.id && r.score !== null),
  ).length;

  doc.font("Helvetica-Bold").fontSize(22).fillColor("#111827");
  doc.text(pdfSafe(party.title), { width });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(11).fillColor(muted);
  doc.text(
    pdfSafe(
      `Blind tasting · ${party.date} · ${poured} ${poured === 1 ? "wine" : "wines"} · ${tasters} ${tasters === 1 ? "taster" : "tasters"} · scored ${party.scoreScale === 5 ? "out of 5 stars" : "out of 100"}`,
    ),
    { width },
  );
  doc.moveDown(1);

  for (const bottle of party.bottles.filter((b) => b.pouredAt !== null)) {
    const reviews = party.reviews.filter(
      (r) => r.partyBottleId === bottle.id && r.score !== null,
    );
    const scores = reviews.map((r) => r.score as number);
    const mean = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;
    const wine = bottle.wine;

    // Keep each wine together on one page.
    if (doc.y > doc.page.height - 170) doc.addPage();
    const top = doc.y;

    doc.font("Helvetica-Bold").fontSize(26).fillColor("#111827");
    doc.text(bottle.label, 60, top, { width: 36 });

    const x = 104;
    const w = width - 44;
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827");
    doc.text(
      pdfSafe(
        `${displayName(wine.winemaker, wine.wineName)} ${wine.year ?? "NV"}`,
      ),
      x,
      top + 2,
      { width: w },
    );
    doc.font("Helvetica").fontSize(10).fillColor(muted);
    const details = [
      wine.type.charAt(0).toUpperCase() + wine.type.slice(1),
      wine.grapes.join(", "),
      [wine.region, wine.country].filter(Boolean).join(", "),
      bottle.broughtBy ? `brought by ${bottle.broughtBy}` : null,
    ].filter(Boolean);
    doc.text(pdfSafe(details.join(" · ")), x, doc.y, { width: w });

    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827");
    doc.text(
      mean === null
        ? "Not scored"
        : `Group ${party.formatDef?.rating.kind === "reaction" ? partyScore(Math.round(mean), party) : scoreText(mean, party.scoreScale)}` +
            (scores.length > 1
              ? `  (range ${scoreText(Math.min(...scores), party.scoreScale)}-${scoreText(Math.max(...scores), party.scoreScale)})`
              : ""),
      x,
      doc.y,
      { width: w, continued: false },
    );

    if (options.includeScores && reviews.length) {
      doc.font("Helvetica").fontSize(10).fillColor("#374151");
      doc.text(
        pdfSafe(
          reviews
            .map(
              (r) =>
                `${guestName.get(r.guestId) ?? "?"} ${partyScore(r.score, party)}`,
            )
            .join("   "),
        ),
        x,
        doc.y,
        { width: w },
      );
    }

    const tags = topTags(
      party.reviews
        .filter((r) => r.partyBottleId === bottle.id)
        .map((r) => r.tags),
    );
    if (tags.length) {
      doc.font("Helvetica-Oblique").fontSize(10).fillColor(muted);
      doc.text(pdfSafe(`The group found: ${tags.join(", ")}`), x, doc.y, {
        width: w,
      });
    }

    doc.x = 60;
    doc.moveDown(1.1);
  }

  doc.font("Helvetica").fontSize(8).fillColor(muted);
  doc.text("Tasted blind with CellarBoss", 60, doc.y, {
    width,
    align: "right",
  });
  doc.end();
  return done;
}

/**
 * One guest's own notes from a party: for each bottle, the wine (once
 * revealed or after the party), their score, tags, structure, notes and
 * guesses. Only their reviews are included, nobody else's.
 */
export function buildGuestSheet(
  party: PartyDetail,
  guestId: number,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 54, bottom: 54, left: 60, right: 60 },
    info: {
      Title: pdfSafe(`${party.title} - my notes`),
      Creator: "CellarBoss",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );

  const width = doc.page.width - 120;
  const muted = "#6b7280";
  const guest = party.guests.find((g) => g.id === guestId);
  const finished = party.status === "finished";

  doc.font("Helvetica-Bold").fontSize(22).fillColor("#111827");
  doc.text(pdfSafe(party.title), { width });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(11).fillColor(muted);
  doc.text(
    pdfSafe(
      `My blind tasting notes · ${guest?.name ?? "Guest"} · ${party.date} · scored ${party.scoreScale === 5 ? "out of 5 stars" : "out of 100"}`,
    ),
    { width },
  );
  doc.moveDown(1);

  for (const bottle of party.bottles.filter((b) => b.pouredAt !== null)) {
    const review = party.reviews.find(
      (r) => r.partyBottleId === bottle.id && r.guestId === guestId,
    );
    const revealed = finished || bottle.revealedAt !== null;
    if (doc.y > doc.page.height - 190) doc.addPage();
    const top = doc.y;

    doc.font("Helvetica-Bold").fontSize(26).fillColor("#111827");
    doc.text(bottle.label, 60, top, { width: 36 });
    const x = 104;
    const w = width - 44;

    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827");
    doc.text(
      revealed
        ? pdfSafe(
            `${displayName(bottle.wine.winemaker, bottle.wine.wineName)} ${bottle.wine.year ?? "NV"}`,
          )
        : "Not revealed yet",
      x,
      top + 2,
      { width: w },
    );
    if (revealed) {
      const wine = bottle.wine;
      doc.font("Helvetica").fontSize(10).fillColor(muted);
      doc.text(
        pdfSafe(
          [
            wine.type.charAt(0).toUpperCase() + wine.type.slice(1),
            wine.grapes.join(", "),
            [wine.region, wine.country].filter(Boolean).join(", "),
            bottle.broughtBy ? `brought by ${bottle.broughtBy}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        ),
        x,
        doc.y,
        { width: w },
      );
    }
    doc.moveDown(0.3);

    if (!review) {
      doc.font("Helvetica-Oblique").fontSize(10).fillColor(muted);
      doc.text("You didn't rate this one.", x, doc.y, { width: w });
    } else {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827");
      doc.text(`My rating: ${partyScore(review.score, party)}`, x, doc.y, {
        width: w,
      });
      doc.font("Helvetica").fontSize(10).fillColor("#374151");
      const structure = Object.entries(review.structure)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k} ${v}/5`);
      // Format parties list each answer by its label; older parties show
      // the 1-5 structure they recorded.
      const answerLines = party.formatDef
        ? describeAnswers(party.formatDef, review.answers)
        : structure.length
          ? [`Structure: ${structure.join(", ")}`]
          : [];
      const lines = [
        review.tags.length ? `Found: ${review.tags.join(", ")}` : null,
        ...answerLines,
        review.notes.trim() ? review.notes.trim() : null,
      ].filter(Boolean) as string[];
      for (const line of lines) doc.text(pdfSafe(line), x, doc.y, { width: w });

      const guessed = Object.entries(review.guesses).filter(
        ([, v]) => v !== undefined && v !== "",
      );
      if (guessed.length) {
        doc.font("Helvetica-Oblique").fontSize(10).fillColor(muted);
        doc.text(
          pdfSafe(
            `I guessed: ${guessed.map(([k, v]) => `${k} ${v}`).join(", ")}`,
          ),
          x,
          doc.y,
          { width: w },
        );
      }
    }
    doc.x = 60;
    doc.moveDown(1.1);
  }

  doc.font("Helvetica").fontSize(8).fillColor(muted);
  doc.text("Tasted blind with CellarBoss", 60, doc.y, {
    width,
    align: "right",
  });
  doc.end();
  return done;
}
