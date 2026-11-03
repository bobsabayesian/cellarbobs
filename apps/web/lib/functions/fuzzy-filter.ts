import Fuse from "fuse.js";
import { searchKey } from "./strings";

export type FilterResult<T> = {
  items: T[];
  /** True when nothing matched exactly and these are typo-tolerant matches. */
  fuzzy: boolean;
};

/**
 * Filters items by a search box: every word must appear in the item's text
 * (accent- and case-blind). When nothing matches that way, falls back to
 * typo-tolerant matching per word, so "bordeax" still finds Bordeaux.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  textOf: (item: T) => string,
  options: { threshold?: number; limit?: number } = {},
): FilterResult<T> {
  const terms = searchKey(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { items, fuzzy: false };

  const keyed = items.map((item) => ({ item, key: searchKey(textOf(item)) }));
  const exact = keyed
    .filter(({ key }) => terms.every((t) => key.includes(t)))
    .map(({ item }) => item);
  if (exact.length > 0) return { items: exact, fuzzy: false };

  // Fuse matches each word against the individual words of the text, so a
  // misspelt word scores against the word it was meant to be.
  const words = keyed.map(({ item, key }) => ({
    item,
    words: [
      ...new Set(key.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1)),
    ],
  }));
  const fuse = new Fuse(words, {
    keys: ["words"],
    threshold: options.threshold ?? 0.35,
    ignoreLocation: true,
    includeScore: true,
  });
  const scores = new Map<T, number>();
  let matchedAll: Set<T> | undefined;
  for (const term of terms) {
    const hits = new Set<T>();
    for (const result of fuse.search(term)) {
      hits.add(result.item.item);
      scores.set(
        result.item.item,
        (scores.get(result.item.item) ?? 0) + (result.score ?? 0),
      );
    }
    matchedAll = matchedAll
      ? new Set([...matchedAll].filter((item) => hits.has(item)))
      : hits;
  }
  const fuzzy = [...(matchedAll ?? [])].sort(
    (a, b) => (scores.get(a) ?? 0) - (scores.get(b) ?? 0),
  );
  return {
    items: options.limit ? fuzzy.slice(0, options.limit) : fuzzy,
    fuzzy: true,
  };
}
