import { describe, it, expect } from "vitest";
import { fuzzyFilter } from "../fuzzy-filter";

const wines = [
  "Château Pontet-Canet 2023 Bordeaux France red Cabernet Sauvignon",
  "Château La Mission Haut-Brion 2011 Bordeaux France red",
  "R. López de Heredia Viña Tondonia 2012 Rioja Spain white",
  "Produttori del Barbaresco Montefico 2016 Piedmont Italy red Nebbiolo",
];

describe("fuzzyFilter", () => {
  const run = (q: string) => fuzzyFilter(wines, q, (w) => w);

  it("matches every word, ignoring accents and case", () => {
    expect(run("lopez tondonia")).toEqual({ items: [wines[2]], fuzzy: false });
    expect(run("BORDEAUX").items).toHaveLength(2);
    expect(run("").items).toHaveLength(4);
  });

  it("falls back to typo-tolerant matches", () => {
    const result = run("bordeax");
    expect(result.fuzzy).toBe(true);
    expect(result.items).toEqual(expect.arrayContaining([wines[0], wines[1]]));
    expect(result.items).not.toContain(wines[3]);
    expect(run("nebiolo piedmont").items).toEqual([wines[3]]);
  });

  it("finds nothing for unrelated text", () => {
    expect(run("zinfandel").items).toEqual([]);
  });
});
