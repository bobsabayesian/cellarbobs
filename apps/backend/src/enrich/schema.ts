import { z } from "zod";

/**
 * What the model is asked to return. Every field may be missing or null:
 * the prompt tells it to leave out anything its sources don't say, and a
 * parse never fails on a field it skipped.
 */
const text = z.string().nullish();
const texts = z.array(z.string()).nullish();
const year = z.number().int().nullish();

export const wineProfileSchema = z.object({
  wine: z
    .object({
      name: text,
      producer: text,
      vintage: year,
      type: text,
      style: text.describe("e.g. Still, full-bodied, savoury"),
      classification: text.describe("e.g. DOCG, Grand Cru Classé"),
    })
    .nullish(),
  origin: z
    .object({
      country: text,
      region: text,
      subregion: text,
      appellation: text,
      commune: text,
      vineyards: texts,
    })
    .nullish(),
  composition: z
    .object({
      grapes: z
        .array(
          z.object({
            variety: z.string(),
            percentage: z.number().nullish(),
          }),
        )
        .nullish(),
      alcohol: text.describe("e.g. 14.0%"),
      bottleFormat: text,
      allergens: texts,
    })
    .nullish(),
  winemaking: z
    .object({
      vineDensity: text,
      yield: text,
      harvest: text,
      fermentation: text,
      oakAging: text,
      otherAging: text.describe("Steel, concrete, amphora or bottle ageing"),
      filtration: text,
      sulfites: text,
    })
    .nullish(),
  tasting: z
    .object({
      appearance: text,
      aromas: texts,
      body: text,
      tannins: text,
      acidity: text,
      finish: text,
    })
    .nullish(),
  serving: z
    .object({
      drinkFrom: year.describe("First year of the drinking window"),
      drinkUntil: year.describe("Last year of the drinking window"),
      temperature: text,
      decanting: text,
      foodPairings: texts,
    })
    .nullish(),
  market: z
    .object({
      averagePriceUsd: z.number().nullish(),
      barcodes: texts.describe("UPC or EAN codes"),
    })
    .nullish(),
  reviews: z
    .array(
      z.object({
        source: z.string().describe("Critic or publication"),
        summary: z
          .string()
          .describe("One sentence in your own words, not a quotation"),
        url: text,
      }),
    )
    .nullish(),
  confidence: z.enum(["high", "medium", "low"]).nullish(),
});

export const lookupResponseSchema = z.object({
  found: z
    .boolean()
    .describe("False if you could not identify this exact wine online"),
  profile: wineProfileSchema.nullish(),
  scores: z
    .array(
      z.object({
        critic: z.string().describe("Critic or publication"),
        score: z.string().describe('As published, e.g. "97/100" or "18/20"'),
        sourceUrl: text.describe("The page the score was published on"),
      }),
    )
    .nullish(),
});

export type LookupResponse = z.infer<typeof lookupResponseSchema>;

/** The response schema as JSON Schema, for Gemini's structured output. */
export function lookupJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(lookupResponseSchema) as Record<
    string,
    unknown
  >;
  delete schema.$schema;
  return schema;
}
