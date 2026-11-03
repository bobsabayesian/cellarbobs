import { describe, it, expect } from "vitest";
import { parseCsv } from "../cellartracker/csv.js";
import {
  buildPlan,
  convertPrice,
  mapGrapes,
  mapSize,
  mapWineType,
  parseCtDate,
  type Row,
} from "../cellartracker/plan.js";
import { planNotes, toScore } from "../cellartracker/notes.js";

const OPTIONS = { eurPerUsd: 0.89 };

function bottle(overrides: Partial<Row> = {}): Row {
  return {
    BottleState: "1",
    iWine: "100",
    Vintage: "2016",
    Wine: "Cordero di Montezemolo Barolo Monfalletto",
    Producer: "Cordero di Montezemolo",
    Type: "Red",
    Country: "Italy",
    Region: "Piedmont",
    SubRegion: "Langhe",
    Appellation: "Barolo",
    Varietal: "Nebbiolo",
    MasterVarietal: "Nebbiolo",
    BottleSize: "750ml",
    Location: "Winnifridge",
    Bin: "Terroir",
    PurchaseDate: "5/2/2021",
    BottleCost: "71.5",
    BottleCostCurrency: "USD",
    ConsumptionDate: "",
    ShortType: "",
    ConsumptionType: "",
    ConsumptionNote: "",
    BottleNote: "",
    PurchaseNote: "",
    BeginConsume: "2024",
    EndConsume: "2040",
    ...overrides,
  };
}

describe("parseCsv", () => {
  it("handles quoted commas, doubled quotes and newlines", () => {
    const rows = parseCsv(
      'a,b,c\r\n"1, one","say ""hi""","line\nbreak"\r\n2,,x\r\n',
    );
    expect(rows).toEqual([
      { a: "1, one", b: 'say "hi"', c: "line\nbreak" },
      { a: "2", b: "", c: "x" },
    ]);
  });
});

describe("field mapping", () => {
  it("parses CellarTracker dates", () => {
    expect(parseCtDate("5/2/2021")).toBe("2021-05-02");
    expect(parseCtDate("")).toBeNull();
  });

  it("maps sizes, keeping a note for sizes CellarBoss lacks", () => {
    expect(mapSize("1.5L")).toEqual({ size: "magnum" });
    expect(mapSize("375ml")).toEqual({ size: "half" });
    expect(mapSize("500ml")).toEqual({ size: "half", note: "500ml" });
  });

  it("maps CellarTracker types", () => {
    expect(mapWineType("White - Sparkling").type).toBe("sparkling");
    expect(mapWineType("Red - Fortified").type).toBe("fortified");
    expect(mapWineType("White - Sweet/Dessert").type).toBe("dessert");
    expect(mapWineType("White - Off-dry").type).toBe("white");
    expect(mapWineType("Fruit/Vegetable Wine")).toEqual({
      type: "sparkling",
      note: "cider",
    });
  });

  it("only keeps a grape for blends with a lead variety", () => {
    expect(mapGrapes("Nebbiolo", "Nebbiolo")).toEqual(["Nebbiolo"]);
    expect(mapGrapes("Tempranillo Blend", "Tempranillo")).toEqual([
      "Tempranillo",
    ]);
    expect(mapGrapes("Red Bordeaux Blend", "Red Bordeaux Blend")).toEqual([]);
    expect(mapGrapes("Apple", "Apple")).toEqual([]);
  });

  it("converts euros to dollars", () => {
    expect(convertPrice("100", "EUR", OPTIONS)).toBe(112.36);
    expect(convertPrice("42.5", "USD", OPTIONS)).toBe(42.5);
  });
});

describe("buildPlan", () => {
  it("creates one wine and vintage per CellarTracker wine", () => {
    const plan = buildPlan(
      [bottle(), bottle(), bottle({ Vintage: "1001" })],
      OPTIONS,
    );
    expect(plan.wines.size).toBe(1);
    const [wine] = plan.wines.values();
    expect(wine.winemaker).toBe("Cordero di Montezemolo");
    expect(wine.name).toBe("Barolo Monfalletto");
    expect(wine.regionNames).toEqual(["Barolo", "Langhe", "Piedmont"]);
    expect([...plan.vintages.values()].map((v) => v.year)).toEqual([
      2016,
      null,
    ]);
  });

  it("keeps bins only for locations that still hold wine", () => {
    const plan = buildPlan(
      [
        bottle(),
        bottle({
          BottleState: "0",
          ShortType: "Drank",
          ConsumptionDate: "10/29/2026",
          ConsumptionNote: "w/Kristen",
        }),
        bottle({
          BottleState: "0",
          Location: "Cellar",
          Bin: "19",
          ShortType: "Donated",
          ConsumptionDate: "1/5/2023",
        }),
        bottle({
          BottleState: "0",
          Location: "none",
          Bin: "12",
          ShortType: "Drank",
          ConsumptionDate: "3/1/2022",
        }),
      ],
      OPTIONS,
    );
    expect([...plan.locations.keys()]).toEqual(["Winnifridge"]);
    const [stored, drunk, donated, noLocation] = plan.bottles;
    expect(stored.storage).toEqual({ location: "Winnifridge", bin: "Terroir" });
    expect(drunk).toMatchObject({
      status: "drunk",
      consumedDate: "2026-10-29",
      consumedNote: "w/Kristen",
      storage: { location: "Winnifridge", bin: "Terroir" },
    });
    expect(donated).toMatchObject({
      status: "gifted",
      storage: null,
      consumedNote: "Donated · was Cellar / 19",
    });
    expect(noLocation.consumedNote).toBe("was bin 12");
  });

  it("treats a young pending vintage as en primeur", () => {
    const plan = buildPlan(
      [
        bottle({
          BottleState: "-1",
          Vintage: "2023",
          PurchaseDate: "4/30/2024",
          Location: "(n/a)",
          Bin: "",
        }),
        bottle({
          BottleState: "-1",
          Vintage: "2011",
          PurchaseDate: "5/22/2025",
          Location: "(n/a)",
          Bin: "",
        }),
      ],
      OPTIONS,
    );
    expect(plan.bottles.map((b) => b.status)).toEqual([
      "in-primeur",
      "ordered",
    ]);
    expect(plan.bottles.every((b) => b.storage === null)).toBe(true);
  });
});

describe("planNotes", () => {
  const plan = buildPlan([bottle()], OPTIONS);

  it("converts ratings out of 100 to scores out of 10", () => {
    expect(toScore("92")).toBe(9);
    expect(toScore("88.5")).toBe(9);
    expect(toScore("")).toBeNull();
  });

  it("links notes to vintages by iWine and keeps the tasting date", () => {
    const result = planNotes(
      [
        {
          iWine: "100",
          TastingDate: "11/1/2026",
          Rating: "93",
          TastingNotes: "Tar and roses.",
        },
      ],
      plan,
    );
    expect(result.notes).toEqual([
      {
        vintageKey: [...plan.vintages.keys()][0],
        date: "2026-11-01T12:00:00.000Z",
        score: 9,
        notes: "Tar and roses.\n\nCellarTracker rating: 93",
      },
    ]);
  });

  it("flags defective bottles and leaves unrated notes at 0", () => {
    const result = planNotes(
      [
        {
          iWine: "100",
          TastingDate: "11/1/2026",
          Rating: "0",
          Defective: "True",
          TastingNotes: "Corked.",
        },
      ],
      plan,
    );
    expect(result.notes[0]).toMatchObject({
      score: 0,
      notes: "Defective bottle.\n\nCorked.",
    });
  });

  it("creates the wine for a note on a bottle never owned", () => {
    const result = planNotes(
      [
        {
          iWine: "999",
          Vintage: "2021",
          Wine: "Merry Edwards Sauvignon Blanc",
          Producer: "Merry Edwards",
          Type: "White",
          Country: "USA",
          TastingDate: "6/1/2024",
          Rating: "90",
          TastingNotes: "Grapefruit.",
        },
      ],
      plan,
    );
    expect([...result.extraWines.values()][0]).toMatchObject({
      winemaker: "Merry Edwards",
      name: "Sauvignon Blanc",
    });
    expect(result.notes[0].vintageKey).toBe(
      "merry edwards|sauvignon blanc|2021",
    );
  });

  it("refuses a file that isn't a Notes export", () => {
    const result = planNotes([{ iConsumed: "1", iWine: "100" }], plan);
    expect(result.notes).toEqual([]);
    expect(result.warnings[0]).toMatch(/not a CellarTracker Notes export/);
  });
});
