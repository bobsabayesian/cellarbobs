/** What we already know about the vintage being looked up. */
export interface LookupSubject {
  producer: string;
  wine: string;
  year: number | null;
  type: string;
  region: string | null;
  country: string | null;
  grapes: string[];
}

export function describeSubject(s: LookupSubject): string {
  const lines = [
    `Producer: ${s.producer}`,
    `Wine: ${s.wine}`,
    `Vintage: ${s.year ?? "non-vintage (NV)"}`,
    `Type: ${s.type}`,
  ];
  if (s.region || s.country)
    lines.push(`From: ${[s.region, s.country].filter(Boolean).join(", ")}`);
  if (s.grapes.length > 0) lines.push(`Grapes: ${s.grapes.join(", ")}`);
  return lines.join("\n");
}

const RULES = `Rules:
- Search the web for this exact wine and vintage. Report only what your sources say; leave a field null rather than guess.
- Critic scores: include a score only if a named critic or publication published it for this exact wine and vintage, and give the page it was published on as sourceUrl. Never estimate or invent a score.
- Reviews: summarise each in one sentence in your own words. Do not quote more than a few words.
- Drinking window: years, as drinkFrom and drinkUntil. If a critic gives one, prefer it.
- Technical details (ageing, yields, alcohol) often come from the producer's technical sheet for the vintage; use another vintage's sheet only if it says the method doesn't change, and otherwise leave it null.
- Set confidence to how sure you are that your sources describe this exact wine and vintage.
- If you can't identify the wine at all, set found to false.`;

/** The prompt for a single grounded call that answers in JSON. */
export function lookupPrompt(s: LookupSubject): string {
  return `Find published information about this wine.\n\n${describeSubject(s)}\n\n${RULES}`;
}

/** First of two calls when the model can't search and answer in JSON at once. */
export function researchPrompt(s: LookupSubject): string {
  return `Find published information about this wine: critic scores (with the page each was published on), review summaries, drinking window, technical details (grapes, alcohol, vinification, ageing), tasting profile, serving and food pairings, price and barcodes.\n\n${describeSubject(s)}\n\n${RULES}\n\nWrite up what you found as notes, including the URL of each source.`;
}

/** Second call: turn the research notes into the JSON shape. */
export function structurePrompt(s: LookupSubject, notes: string): string {
  return `Turn these research notes about a wine into the requested JSON. Use only what the notes say.\n\n${describeSubject(s)}\n\n${RULES}\n\nNotes:\n${notes}`;
}
