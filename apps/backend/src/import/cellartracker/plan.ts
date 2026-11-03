import type { Bottle, Wine } from "@cellarboss/types";
import { cleanText, foldKey } from "../normalise/text.js";
import { deriveWineName } from "../normalise/wine-name.js";
import { toWineType } from "../normalise/wine-type.js";

/**
 * Turns CellarTracker "Bottles" export rows into an import plan: the
 * winemakers, wines, vintages, storages and bottles to create, keyed so the
 * same wine or bin is only created once. Pure — the writer resolves the plan
 * against the database.
 */

export type Row = Record<string, string>;

export interface PlanOptions {
  /** Euros per US dollar, e.g. 0.89 means 1 USD = 0.89 EUR. */
  eurPerUsd: number;
}

export interface PlannedWine {
  key: string;
  name: string;
  winemaker: string;
  type: Wine["type"];
  country: string | null;
  /** Most specific first: appellation, sub-region, region. */
  regionNames: string[];
  grapes: string[];
}

export interface PlannedVintage {
  key: string;
  wineKey: string;
  year: number | null;
  drinkFrom: number | null;
  drinkUntil: number | null;
}

export interface PlannedStorage {
  location: string;
  bin: string | null;
}

export interface PlannedBottle {
  vintageKey: string;
  purchaseDate: string;
  purchasePrice: number;
  status: Bottle["status"];
  size: Bottle["size"];
  storage: PlannedStorage | null;
  consumedDate: string | null;
  consumedNote: string | null;
}

export interface Plan {
  wines: Map<string, PlannedWine>;
  vintages: Map<string, PlannedVintage>;
  /** CellarTracker's iWine (one wine in one vintage) to a vintage key. */
  vintageByIWine: Map<string, string>;
  /** Locations kept as storages, each with its bins. */
  locations: Map<string, Set<string>>;
  bottles: PlannedBottle[];
  warnings: string[];
  dropped: { bottleNotes: number; purchaseNotes: number };
}

/** CellarTracker's vintage for non-vintage wine. */
const NON_VINTAGE = 1001;

/** Location names CellarTracker users use to mean "nowhere in particular". */
const PLACEHOLDER_LOCATIONS = new Set(["", "none", "(n/a)", "n/a", "unknown"]);

const SIZES: Record<string, Bottle["size"]> = {
  "187ml": "piccolo",
  "375ml": "half",
  "750ml": "standard",
  "1.0l": "litre",
  "1l": "litre",
  "1.5l": "magnum",
  "3.0l": "double-magnum",
  "3l": "double-magnum",
  "4.5l": "jeroboam",
  "6.0l": "imperial",
  "6l": "imperial",
  "9.0l": "salmanazar",
  "12.0l": "balthazar",
  "15.0l": "nebuchadnezzar",
};

/** Sizes with no CellarBoss equivalent, mapped to the nearest one. */
const NEAREST_SIZES: Record<string, Bottle["size"]> = {
  "500ml": "half",
  "620ml": "standard",
  "1.75l": "magnum",
};

/** ShortType of a consumed bottle to a status, and a label kept in the note. */
const CONSUMPTION: Record<
  string,
  { status: Bottle["status"]; label?: string }
> = {
  drank: { status: "drunk" },
  gifted: { status: "gifted" },
  donated: { status: "gifted", label: "Donated" },
  sold: { status: "sold" },
  spoiled: { status: "drunk", label: "Spoiled" },
  tasted: { status: "drunk", label: "Tasted" },
  missing: { status: "drunk", label: "Missing" },
};

export function isPlaceholderLocation(name: string): boolean {
  return PLACEHOLDER_LOCATIONS.has(name.trim().toLowerCase());
}

/** "12/18/2025" (CellarTracker's M/D/YYYY) to "2025-12-18". */
export function parseCtDate(value: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, month, day, year] = m;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseYear(value: string, min: number, max: number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function known(value: string | undefined): string | null {
  const v = cleanText(value ?? "");
  return v && v.toLowerCase() !== "unknown" ? v : null;
}

export function mapSize(value: string): {
  size: Bottle["size"];
  note?: string;
} {
  const key = value.trim().toLowerCase();
  if (SIZES[key]) return { size: SIZES[key] };
  return { size: NEAREST_SIZES[key] ?? "standard", note: value.trim() };
}

export function mapWineType(ctType: string): {
  type: Wine["type"];
  note?: string;
} {
  if (/fruit|vegetable|cider/i.test(ctType)) {
    return { type: "sparkling", note: "cider" };
  }
  return { type: toWineType(ctType) ?? "red" };
}

/** CellarTracker varietals to grape names: blends without a lead grape give none. */
export function mapGrapes(varietal: string, masterVarietal: string): string[] {
  const v = known(varietal);
  if (!v || /fruit|apple|pear/i.test(v)) return [];
  if (!/\bblend\b/i.test(v)) return [v];
  const master = known(masterVarietal);
  return master && !/\bblend\b/i.test(master) ? [master] : [];
}

export function convertPrice(
  amount: string,
  currency: string,
  options: PlanOptions,
): number {
  const n = Number(amount) || 0;
  const value =
    currency.trim().toUpperCase() === "EUR" ? n / options.eurPerUsd : n;
  return Math.round(value * 100) / 100;
}

/** The wine and vintage a CellarTracker row (Bottles or Notes export) describes. */
export function planWineAndVintage(row: Row): {
  wine: PlannedWine;
  vintage: PlannedVintage;
} {
  const producer = cleanText(row.Producer ?? "") || "Unknown producer";
  const year =
    Number(row.Vintage) === NON_VINTAGE
      ? null
      : parseYear(row.Vintage ?? "", 1800, 2100);
  const name = deriveWineName(row.Wine ?? "", { winemaker: producer, year });
  const wineKey = `${foldKey(producer)}|${foldKey(name)}`;
  const country = known(row.Country);
  return {
    wine: {
      key: wineKey,
      name,
      winemaker: producer,
      type: mapWineType(row.Type ?? "").type,
      country,
      regionNames: [row.Appellation, row.SubRegion, row.Region]
        .map(known)
        .filter((r): r is string => !!r && r !== country),
      grapes: mapGrapes(row.Varietal ?? "", row.MasterVarietal ?? ""),
    },
    vintage: {
      key: `${wineKey}|${year ?? "NV"}`,
      wineKey,
      year,
      drinkFrom: parseYear(row.BeginConsume ?? "", 1800, 2200),
      drinkUntil: parseYear(row.EndConsume ?? "", 1800, 2200),
    },
  };
}

export function buildPlan(rows: Row[], options: PlanOptions): Plan {
  const plan: Plan = {
    wines: new Map(),
    vintages: new Map(),
    vintageByIWine: new Map(),
    locations: new Map(),
    bottles: [],
    warnings: [],
    dropped: { bottleNotes: 0, purchaseNotes: 0 },
  };

  // Only locations still holding wine become storages; the rest are history.
  for (const row of rows) {
    const location = cleanText(row.Location ?? "");
    if (row.BottleState === "1" && !isPlaceholderLocation(location)) {
      plan.locations.set(location, new Set());
    }
  }

  for (const row of rows) {
    const { wine, vintage } = planWineAndVintage(row);
    const { key: wineKey, winemaker: producer, name } = wine;
    const { key: vintageKey, year } = vintage;
    const { note: typeNote } = mapWineType(row.Type ?? "");
    if (!plan.wines.has(wineKey)) plan.wines.set(wineKey, wine);
    const existing = plan.vintages.get(vintageKey);
    if (!existing) {
      plan.vintages.set(vintageKey, vintage);
    } else {
      existing.drinkFrom ??= vintage.drinkFrom;
      existing.drinkUntil ??= vintage.drinkUntil;
    }
    if (row.iWine) plan.vintageByIWine.set(row.iWine, vintageKey);

    const purchaseDate = parseCtDate(row.PurchaseDate ?? "");
    if (!purchaseDate) {
      plan.warnings.push(
        `No purchase date for ${producer} ${name} ${year ?? "NV"}; used 1900-01-01`,
      );
    }
    const purchasePrice = convertPrice(
      row.BottleCost ?? "0",
      row.BottleCostCurrency ?? "USD",
      options,
    );
    const { size, note: sizeNote } = mapSize(row.BottleSize ?? "750ml");

    const location = cleanText(row.Location ?? "");
    const bin = cleanText(row.Bin ?? "") || null;
    const kept = plan.locations.get(location);
    let storage: PlannedStorage | null = null;
    if (kept && row.BottleState !== "-1") {
      if (bin) kept.add(bin);
      storage = { location, bin };
    }

    if ((row.BottleNote ?? "").trim()) plan.dropped.bottleNotes++;
    if ((row.PurchaseNote ?? "").trim()) plan.dropped.purchaseNotes++;

    let status: Bottle["status"];
    let consumedDate: string | null = null;
    let consumedNote: string | null = null;

    if (row.BottleState === "1") {
      status = "stored";
    } else if (row.BottleState === "-1") {
      // Pending. A young vintage bought ahead of release is en primeur.
      const purchaseYear = Number((purchaseDate ?? "").slice(0, 4));
      status =
        year !== null && purchaseYear && year >= purchaseYear - 2
          ? "in-primeur"
          : "ordered";
    } else {
      const consumption = CONSUMPTION[(row.ShortType ?? "").toLowerCase()] ?? {
        status: "drunk" as const,
        label: cleanText(row.ConsumptionType ?? "") || undefined,
      };
      status = consumption.status;
      consumedDate = parseCtDate(row.ConsumptionDate ?? "");
      const history =
        storage || (isPlaceholderLocation(location) && !bin)
          ? null
          : isPlaceholderLocation(location)
            ? `was bin ${bin}`
            : `was ${location}${bin ? ` / ${bin}` : ""}`;
      const parts = [
        consumption.label,
        cleanText(row.ConsumptionNote ?? ""),
        sizeNote,
        typeNote,
        history,
      ].filter(Boolean);
      consumedNote = parts.length ? parts.join(" · ") : null;
    }

    if (status !== "drunk" && status !== "gifted" && status !== "sold") {
      if (sizeNote)
        plan.warnings.push(
          `${producer} ${name} ${year ?? "NV"} is ${sizeNote}; imported as ${size}`,
        );
    }

    plan.bottles.push({
      vintageKey,
      purchaseDate: purchaseDate ?? "1900-01-01",
      purchasePrice,
      status,
      size,
      storage,
      consumedDate,
      consumedNote,
    });
  }

  return plan;
}
