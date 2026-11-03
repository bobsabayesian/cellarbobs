import { describe, it, expect } from "vitest";
import { displayName, pdfSafe } from "../pdf.js";

describe("pdfSafe", () => {
  it("keeps Western European accents and replaces what Helvetica can't draw", () => {
    expect(
      pdfSafe("Sorì San Lorenzo · Château · Müller-Thurgau – “Cuvée”"),
    ).toBe("Sorì San Lorenzo · Château · Müller-Thurgau – “Cuvée”");
    expect(pdfSafe("Kőbányai")).toBe("Kobányai");
    expect(pdfSafe("Αγιωργίτικο")).toMatch(/^[?A-Za-z]+$/);
  });
});

describe("displayName", () => {
  it("names a château-named wine once", () => {
    expect(displayName("Château Le Gay", "Château Le Gay Pomerol")).toBe(
      "Château Le Gay Pomerol",
    );
    expect(displayName("Sottimano", "Barbaresco Fausoni")).toBe(
      "Sottimano Barbaresco Fausoni",
    );
  });
});
