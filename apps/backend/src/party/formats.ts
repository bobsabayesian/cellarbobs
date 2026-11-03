import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { z } from "zod";
import type {
  PartyFormatId,
  PartyStructure,
  TastingFormat,
  TastingFormatField,
} from "@cellarboss/types";
import { env } from "@utils/env.js";
import { logger } from "@utils/logger.js";
import { getTagGroups } from "./tags.js";

/**
 * Tasting formats for parties: what guests are asked about each bottle.
 *
 * A format is steps -> blocks -> fields. A field is a `scale` (pick one,
 * ordered low to high), `multi` (pick several) or `colour` (pick the colour
 * family seen in the glass, then a shade). The last step also holds the
 * rating: the party's score, or a short list of reactions mapped to scores.
 *
 * Formats are JSON files in PARTY_FORMATS_DIR (beginner.json, advanced.json)
 * so the host can edit the vocabulary; edits apply to the next request.
 * Missing files are written with the defaults below; an invalid file falls
 * back to its default and the reason is logged.
 *
 * Answers are stored per field key. From them the server also derives the
 * older `tags` (fields marked `tag`) and 1-5 `structure` (scales marked
 * `structure`), which the palate stats, PDFs and exports already use.
 */

export const FORMAT_IDS: PartyFormatId[] = ["beginner", "advanced"];

const label = z.string().trim().min(1).max(60);

const fieldSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, "lower-case letters, digits and _"),
    label,
    kind: z.enum(["scale", "multi", "colour"]),
    options: z.array(label).min(1).max(40).optional(),
    families: z
      .record(
        label,
        z
          .array(
            z.object({
              label,
              color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            }),
          )
          .min(1)
          .max(12),
      )
      .optional(),
    note: z.string().max(80).optional(),
    cols: z.number().int().min(1).max(6).optional(),
    tag: z.boolean().optional(),
    structure: z.enum(["acidity", "tannin", "body", "oak"]).optional(),
  })
  .superRefine((f, ctx) => {
    if (f.kind === "colour" && !f.families)
      ctx.addIssue({
        code: "custom",
        message: `${f.key}: colour needs families`,
      });
    if (f.kind !== "colour" && !f.options)
      ctx.addIssue({ code: "custom", message: `${f.key}: needs options` });
    if (f.structure && f.kind !== "scale")
      ctx.addIssue({
        code: "custom",
        message: `${f.key}: structure needs a scale`,
      });
  });

const formatSchema = z
  .object({
    name: label,
    description: z.string().max(200).optional(),
    rating: z.union([
      z.object({ kind: z.literal("score") }),
      z.object({
        kind: z.literal("reaction"),
        options: z
          .array(z.object({ label, score: z.number().int().min(0).max(100) }))
          .min(2)
          .max(6),
      }),
    ]),
    steps: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
          title: label,
          hint: z.string().max(160).optional(),
          blocks: z
            .array(
              z.object({
                id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
                title: label,
                subtitle: z.string().max(80).optional(),
                collapsible: z.boolean().optional(),
                open: z.boolean().optional(),
                fields: z.array(fieldSchema).min(1).max(30),
              }),
            )
            .min(1)
            .max(12),
        }),
      )
      .min(1)
      .max(6),
  })
  .superRefine((f, ctx) => {
    const keys = f.steps.flatMap((s) =>
      s.blocks.flatMap((b) => b.fields.map((x) => x.key)),
    );
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length)
      ctx.addIssue({
        code: "custom",
        message: `duplicate field keys: ${[...new Set(dupes)].join(", ")}`,
      });
  });

const FIVE = ["low", "medium-", "medium", "medium+", "high"];

export function defaultBeginner(): TastingFormat {
  return {
    id: "beginner",
    name: "Beginner",
    description:
      "One screen: colour, aromas, sweetness, body, and how much you liked it.",
    rating: {
      kind: "reaction",
      options: [
        { label: "loved it", score: 95 },
        { label: "liked it", score: 85 },
        { label: "not for me", score: 70 },
      ],
    },
    steps: [
      {
        id: "taste",
        title: "Taste",
        hint: "Look, swirl, sniff, sip. Tap whatever fits; nothing is wrong.",
        blocks: [
          {
            id: "colour",
            title: "Colour",
            subtitle: "Pick what you see, then the shade",
            fields: [
              {
                key: "colour",
                label: "Colour",
                kind: "colour",
                families: {
                  White: [
                    { label: "pale yellow", color: "#F3E59A" },
                    { label: "gold", color: "#E2B348" },
                  ],
                  Red: [
                    { label: "light red", color: "#C2414B" },
                    { label: "dark red", color: "#6E1A2A" },
                    { label: "purple", color: "#5A1D4C" },
                  ],
                  Rosé: [
                    { label: "pink", color: "#F2A3B3" },
                    { label: "salmon", color: "#F09C7A" },
                  ],
                  Orange: [
                    { label: "orange", color: "#E2854A" },
                    { label: "amber", color: "#C47F2A" },
                  ],
                },
              },
            ],
          },
          {
            id: "aromas",
            title: "What do you smell?",
            // Seeded from the tags file, so edits made to it carry over.
            fields: Object.entries(getTagGroups()).map(([group, tags]) => ({
              key: `aroma_${group
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .slice(0, 30)}`,
              label: group.charAt(0).toUpperCase() + group.slice(1),
              kind: "multi" as const,
              options: [...tags],
              tag: true,
            })),
          },
          {
            id: "palate",
            title: "In your mouth",
            fields: [
              {
                key: "sweetness",
                label: "Sweetness",
                kind: "scale",
                options: ["dry", "sweet"],
              },
              {
                key: "body",
                label: "Body",
                kind: "scale",
                options: ["light", "medium", "heavy"],
                structure: "body",
              },
              {
                key: "tannin",
                label: "Tannin",
                kind: "scale",
                options: ["soft", "grippy"],
                note: "reds only",
                structure: "tannin",
              },
            ],
          },
        ],
      },
    ],
  };
}

export function defaultAdvanced(): TastingFormat {
  const aroma = (key: string, l: string, options: string[]) => ({
    key,
    label: l,
    kind: "multi" as const,
    options,
    tag: true,
  });
  return {
    id: "advanced",
    name: "Advanced",
    description:
      "A systematic tasting in four steps: look, nose, palate, conclusion.",
    rating: { kind: "score" },
    steps: [
      {
        id: "look",
        title: "Look",
        hint: "Tilt the glass against something white.",
        blocks: [
          {
            id: "appearance",
            title: "Appearance",
            fields: [
              {
                key: "clarity",
                label: "Clarity",
                kind: "scale",
                options: ["clear", "hazy"],
              },
              {
                key: "intensity",
                label: "Intensity",
                kind: "scale",
                options: ["pale", "medium", "deep"],
              },
            ],
          },
          {
            id: "colour",
            title: "Colour",
            subtitle: "Pick what you see, then the shade",
            fields: [
              {
                key: "colour",
                label: "Colour",
                kind: "colour",
                note: "youngest to oldest",
                families: {
                  White: [
                    { label: "lemon-green", color: "#E6EBA8" },
                    { label: "lemon", color: "#F2E27E" },
                    { label: "gold", color: "#E2B348" },
                    { label: "amber", color: "#C47F2A" },
                    { label: "brown", color: "#8A5A2B" },
                  ],
                  Rosé: [
                    { label: "pink", color: "#F2A3B3" },
                    { label: "salmon", color: "#F09C7A" },
                    { label: "orange", color: "#E2854A" },
                  ],
                  Red: [
                    { label: "purple", color: "#5A1D4C" },
                    { label: "ruby", color: "#8C1631" },
                    { label: "garnet", color: "#7A2B27" },
                    { label: "tawny", color: "#9A5A35" },
                    { label: "brown", color: "#5C3A22" },
                  ],
                },
              },
            ],
          },
          {
            id: "other",
            title: "Other observations",
            subtitle: "Bubbles, legs, deposit",
            collapsible: true,
            fields: [
              {
                key: "bubbles",
                label: "Bubbles",
                kind: "multi",
                options: ["petillance", "creamy", "aggressive", "fine"],
              },
              {
                key: "viscosity",
                label: "Viscosity",
                kind: "multi",
                options: ["tears", "legs", "thick", "watery"],
              },
              {
                key: "deposit",
                label: "Deposit",
                kind: "multi",
                options: ["sediment", "tartrates"],
              },
            ],
          },
        ],
      },
      {
        id: "nose",
        title: "Nose",
        hint: "Swirl, then sniff. Tap what you get, and open a section for more.",
        blocks: [
          {
            id: "nose_intensity",
            title: "Intensity",
            fields: [
              {
                key: "nose_intensity",
                label: "How strong is the smell?",
                kind: "scale",
                options: [
                  "light",
                  "medium-",
                  "medium",
                  "medium+",
                  "pronounced",
                ],
              },
            ],
          },
          {
            id: "primary",
            title: "Primary",
            subtitle: "From the grape and fermentation",
            collapsible: true,
            open: true,
            fields: [
              aroma("p_fruit", "Fruit", [
                "cherry",
                "red berry",
                "black fruit",
                "plum",
                "citrus",
                "green apple",
                "stone fruit",
                "tropical",
                "dried fruit",
              ]),
              aroma("p_floral", "Floral", ["rose", "violet", "white flowers"]),
              aroma("p_earth", "Earth", ["earth", "mineral", "tar"]),
              aroma("p_vegetal", "Vegetal", [
                "grass",
                "bell pepper",
                "mint",
                "eucalyptus",
                "tomato leaf",
                "herbal",
              ]),
              aroma("p_spice", "Spice", ["pepper", "baking spice", "licorice"]),
            ],
          },
          {
            id: "secondary",
            title: "Secondary",
            subtitle: "From winemaking",
            collapsible: true,
            fields: [
              aroma("s_oak", "Oak", [
                "vanilla",
                "toast",
                "cedar",
                "smoke",
                "dill",
                "clove",
              ]),
              aroma("s_malo", "Malolactic", ["butter", "cream", "cheese"]),
              aroma("s_auto", "Autolytic", [
                "brioche",
                "biscuit",
                "bread",
                "pastry",
                "yeast",
              ]),
            ],
          },
          {
            id: "tertiary",
            title: "Tertiary",
            subtitle: "From maturation and age",
            collapsible: true,
            fields: [
              aroma("t_red", "Red ageing", [
                "leather",
                "forest floor",
                "mushroom",
                "meaty",
                "tobacco",
                "wet leaves",
                "dried fruit",
              ]),
              aroma("t_white", "White ageing", [
                "petrol",
                "honey",
                "marzipan",
                "almond",
                "marmalade",
                "dried apricot",
              ]),
              aroma("t_ox", "Oxidation", [
                "caramel",
                "toffee",
                "chocolate",
                "coffee",
                "walnut",
              ]),
            ],
          },
        ],
      },
      {
        id: "palate",
        title: "Palate",
        hint: "Take a sip and hold it. Tannin is the drying grip, mostly in reds.",
        blocks: [
          {
            id: "structure",
            title: "Structure",
            fields: [
              {
                key: "sweetness",
                label: "Sweetness",
                kind: "scale",
                options: [
                  "dry",
                  "off-dry",
                  "medium-dry",
                  "medium-sweet",
                  "sweet",
                ],
                cols: 3,
              },
              {
                key: "acidity",
                label: "Acidity",
                kind: "scale",
                options: FIVE,
                structure: "acidity",
              },
              {
                key: "acidity_feel",
                label: "Acidity feels",
                kind: "multi",
                options: [
                  "crisp",
                  "tart",
                  "steely",
                  "flabby",
                  "racy",
                  "mouth-watering",
                ],
              },
              {
                key: "tannin",
                label: "Tannin",
                kind: "scale",
                options: FIVE,
                note: "skip for most whites",
                structure: "tannin",
              },
              {
                key: "tannin_feel",
                label: "Tannin feels",
                kind: "multi",
                options: [
                  "silky",
                  "velvety",
                  "fine-grained",
                  "grippy",
                  "coarse",
                  "chalky",
                  "astringent",
                  "unripe",
                ],
              },
              {
                key: "alcohol",
                label: "Alcohol",
                kind: "scale",
                options: ["low", "medium", "high"],
              },
              {
                key: "alcohol_feel",
                label: "Alcohol feels",
                kind: "scale",
                options: ["integrated", "warming", "hot"],
              },
              {
                key: "body",
                label: "Body",
                kind: "scale",
                options: ["light", "medium-", "medium", "medium+", "full"],
                structure: "body",
              },
            ],
          },
          {
            id: "flavour",
            title: "Flavour and finish",
            fields: [
              {
                key: "flavour_intensity",
                label: "Flavour intensity",
                kind: "scale",
                options: [
                  "light",
                  "medium-",
                  "medium",
                  "medium+",
                  "pronounced",
                ],
              },
              {
                key: "finish",
                label: "Finish length",
                kind: "scale",
                options: ["short", "medium-", "medium", "medium+", "long"],
              },
              {
                key: "complexity",
                label: "Complexity",
                kind: "scale",
                options: ["simple", "some complexity", "very complex"],
              },
            ],
          },
        ],
      },
      {
        id: "conclusion",
        title: "Conclusion",
        hint: "How is it drinking, and how good is it?",
        blocks: [
          {
            id: "verdict",
            title: "Verdict",
            fields: [
              {
                key: "development",
                label: "How is it drinking?",
                kind: "scale",
                options: [
                  "youthful",
                  "developing",
                  "fully developed",
                  "tired/past its best",
                ],
                cols: 2,
              },
              {
                key: "quality",
                label: "Quality",
                kind: "scale",
                options: [
                  "poor",
                  "acceptable",
                  "good",
                  "very good",
                  "outstanding",
                ],
                cols: 3,
              },
            ],
          },
        ],
      },
    ],
  };
}

const DEFAULTS: Record<PartyFormatId, () => TastingFormat> = {
  beginner: defaultBeginner,
  advanced: defaultAdvanced,
};

/** Parses a format file's contents. Throws with a readable reason. */
export function parseFormat(id: PartyFormatId, text: string): TastingFormat {
  const result = formatSchema.safeParse(JSON.parse(text));
  if (!result.success)
    throw new Error(
      result.error.issues
        .map((i) => `${i.path.join(".") || "file"}: ${i.message}`)
        .join("; "),
    );
  return { id, ...result.data } as TastingFormat;
}

function fileFor(id: PartyFormatId, dir = env.PARTY_FORMATS_DIR) {
  return dir ? join(dir, `${id}.json`) : null;
}

/** Writes any missing format files with the defaults. */
export function ensureFormatFiles(dir = env.PARTY_FORMATS_DIR): void {
  if (!dir) return;
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    for (const id of FORMAT_IDS) {
      const path = fileFor(id, dir)!;
      if (existsSync(path)) continue;
      const { id: _id, ...body } = DEFAULTS[id]();
      void _id;
      writeFileSync(path, JSON.stringify(body, null, 2) + "\n");
      logger.withContext({ path }).info("Wrote default tasting format");
    }
  } catch (err) {
    logger.withError(err as Error).warn("Could not write tasting format files");
  }
}

const cache = new Map<string, { mtimeMs: number; format: TastingFormat }>();

/** The current definition of a format: its file's if valid, else the default. */
export function getFormat(
  id: PartyFormatId,
  dir = env.PARTY_FORMATS_DIR,
): TastingFormat {
  const path = fileFor(id, dir);
  if (!path || !existsSync(path)) return DEFAULTS[id]();
  try {
    const { mtimeMs } = statSync(path);
    const hit = cache.get(path);
    if (hit && hit.mtimeMs === mtimeMs) return hit.format;
    const format = parseFormat(id, readFileSync(path, "utf8"));
    cache.set(path, { mtimeMs, format });
    return format;
  } catch (err) {
    logger
      .withContext({ path, reason: (err as Error).message })
      .warn("Invalid tasting format file; using the default");
    return DEFAULTS[id]();
  }
}

export function formatFields(format: TastingFormat): TastingFormatField[] {
  return format.steps.flatMap((s) => s.blocks.flatMap((b) => b.fields));
}

/** "Red: garnet" for a colour answer (or just "Red" before a shade). */
export function colourValue(family: string, shade?: string): string {
  return shade ? `${family}: ${shade}` : family;
}

export type Answers = Record<string, string | string[]>;

/**
 * Checks answers against a format and derives the legacy tags and
 * structure from them. Unknown fields or options are an error, so a guest
 * page built from an older version of the file can't save nonsense.
 */
export function readAnswers(
  format: TastingFormat,
  answers: Answers,
): { answers: Answers; tags: string[]; structure: PartyStructure } {
  const fields = new Map(formatFields(format).map((f) => [f.key, f]));
  const clean: Answers = {};
  const tags: string[] = [];
  const structure: PartyStructure = {};

  for (const [key, value] of Object.entries(answers)) {
    const field = fields.get(key);
    if (!field) throw new Error(`Unknown question: ${key}`);
    if (field.kind === "multi") {
      if (!Array.isArray(value))
        throw new Error(`${field.label}: expected a list`);
      const allowed = new Set(field.options);
      const bad = value.filter((v) => !allowed.has(v));
      if (bad.length)
        throw new Error(`${field.label}: not an option: ${bad.join(", ")}`);
      const picked = [...new Set(value)];
      if (picked.length) clean[key] = picked;
      if (field.tag) tags.push(...picked);
      continue;
    }
    if (typeof value !== "string")
      throw new Error(`${field.label}: expected one answer`);
    if (value === "") continue;
    if (field.kind === "colour") {
      const [family, shade] = value.split(": ");
      const shades = field.families?.[family];
      if (
        !shades ||
        (shade !== undefined && !shades.some((s) => s.label === shade))
      )
        throw new Error(`${field.label}: not an option: ${value}`);
      clean[key] = value;
      continue;
    }
    const index = field.options!.indexOf(value);
    if (index < 0) throw new Error(`${field.label}: not an option: ${value}`);
    clean[key] = value;
    if (field.structure) {
      const n = field.options!.length;
      structure[field.structure] =
        n === 1 ? 3 : Math.round(1 + (4 * index) / (n - 1));
    }
  }
  return { answers: clean, tags: [...new Set(tags)], structure };
}

/** "Finish length: long"-style lines for answers that aren't aroma tags. */
export function describeAnswers(
  format: TastingFormat,
  answers: Answers,
): string[] {
  const lines: string[] = [];
  for (const field of formatFields(format)) {
    const value = answers[field.key];
    if (value === undefined || field.tag) continue;
    const text = Array.isArray(value) ? value.join(", ") : value;
    if (text) lines.push(`${field.label}: ${text}`);
  }
  return lines;
}

/** The reaction label for a stored score in a reaction-rated format. */
export function reactionFor(
  format: TastingFormat,
  score: number | null,
): string | null {
  if (score === null || format.rating.kind !== "reaction") return null;
  const options = format.rating.options;
  return options.reduce((best, o) =>
    Math.abs(o.score - score) < Math.abs(best.score - score) ? o : best,
  ).label;
}
