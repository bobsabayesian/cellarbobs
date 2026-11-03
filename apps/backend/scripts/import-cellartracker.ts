/**
 * Imports a CellarTracker export (xlquery.asp CSVs) into CellarBoss.
 *
 *   DATABASE_TYPE=sqlite DATABASE_URL=/path/to/cellarboss.sqlite \
 *     pnpm --filter @cellarboss/backend import:cellartracker <dir> [options]
 *
 *   <dir>                 Folder holding bottles.csv (required) and notes.csv
 *   --dry-run             Run the whole import, print the report, then roll back
 *   --eur-per-usd <rate>  EUR prices are divided by this (default 0.89)
 *   --author <email>      User the tasting notes belong to (default: first admin)
 *   --currency <code>     Also set the display currency setting (default USD)
 *   --allow-existing      Import even though the database already has bottles
 *
 * Everything runs in one transaction: a failure leaves the database untouched.
 * Back the database up first anyway.
 */
import { existsSync } from "fs";
import path from "path";
import { parseArgs } from "util";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", default: false },
    "eur-per-usd": { type: "string", default: "0.89" },
    author: { type: "string" },
    currency: { type: "string", default: "USD" },
    "allow-existing": { type: "boolean", default: false },
  },
});

const dir = positionals[0];
if (!dir || !existsSync(path.join(dir, "bottles.csv"))) {
  console.error("Usage: import:cellartracker <dir containing bottles.csv>");
  process.exit(1);
}
const eurPerUsd = Number(args["eur-per-usd"]);
if (!(eurPerUsd > 0)) {
  console.error("--eur-per-usd must be a positive number");
  process.exit(1);
}

// The backend's env schema wants these even though the import doesn't use them.
process.env.NODE_ENV ??= "production";
process.env.BETTER_AUTH_SECRET ??= "unused-by-cellartracker-import";

const { db } = await import("@utils/database.js");
const { insertReturning } = await import("@utils/query-helpers.js");
const { readCellarTrackerCsv } =
  await import("../src/import/cellartracker/csv.js");
const { buildPlan } = await import("../src/import/cellartracker/plan.js");
const { planNotes } = await import("../src/import/cellartracker/notes.js");
const { matchByName } = await import("../src/import/reconcile/match.js");
const { COUNTRY_ALIASES, GRAPE_ALIASES, REGION_ALIASES } =
  await import("../src/import/normalise/aliases.js");
const { foldKey } = await import("../src/import/normalise/text.js");

class DryRun extends Error {}

const bottleRows = readCellarTrackerCsv(path.join(dir, "bottles.csv"));
const notesPath = path.join(dir, "notes.csv");
const noteRows = existsSync(notesPath) ? readCellarTrackerCsv(notesPath) : [];

const plan = buildPlan(bottleRows, { eurPerUsd });
const notes = planNotes(noteRows, plan);

const report: string[] = [];
const say = (line = "") => report.push(line);
const created = {
  winemakers: [] as string[],
  countries: [] as string[],
  regions: [] as string[],
  grapes: [] as string[],
};
const counts = { wines: 0, winesMatched: 0, vintages: 0, vintagesMatched: 0 };

try {
  await db.transaction().execute(async (trx) => {
    // --- preconditions ---------------------------------------------------
    const bottleColumns =
      (await trx.introspection.getTables())
        .find((t) => t.name === "bottle")
        ?.columns.map((c) => c.name) ?? [];
    if (!bottleColumns.includes("consumedDate")) {
      throw new Error(
        "The database is missing bottle.consumedDate. Run migrations first (pnpm migrate, or start the updated backend once).",
      );
    }

    const existingBottles = await trx
      .selectFrom("bottle")
      .select((eb) => eb.fn.countAll().as("n"))
      .executeTakeFirstOrThrow();
    if (Number(existingBottles.n) > 0 && !args["allow-existing"]) {
      throw new Error(
        `The database already has ${existingBottles.n} bottles. Importing again would duplicate them; pass --allow-existing to import anyway.`,
      );
    }

    const users = await trx
      .selectFrom("user")
      .select(["id", "email", "role"])
      .execute();
    const author = args.author
      ? users.find((u) => u.email.toLowerCase() === args.author!.toLowerCase())
      : (users.find((u) => u.role === "admin") ?? users[0]);
    if (notes.notes.length && !author) {
      throw new Error(
        args.author
          ? `No user with email ${args.author}`
          : "No users exist to own the tasting notes",
      );
    }

    // --- reference data --------------------------------------------------
    const winemakers = await trx.selectFrom("winemaker").selectAll().execute();
    const countries = await trx.selectFrom("country").selectAll().execute();
    const regions = await trx.selectFrom("region").selectAll().execute();
    const grapes = await trx.selectFrom("grape").selectAll().execute();

    const winemakerIds = new Map<string, number>();
    async function winemakerId(name: string): Promise<number> {
      const key = foldKey(name);
      const cached = winemakerIds.get(key);
      if (cached) return cached;
      const match = matchByName(name, winemakers, {
        ignoreWords: ["estate", "estates", "winery", "wines", "vineyards"],
      });
      let id: number;
      if (match.status === "matched") {
        id = match.id;
      } else {
        const row = await insertReturning(trx, "winemaker", { name });
        winemakers.push(row);
        created.winemakers.push(name);
        id = row.id;
      }
      winemakerIds.set(key, id);
      return id;
    }

    async function countryId(name: string): Promise<number> {
      const match = matchByName(name, countries, { aliases: COUNTRY_ALIASES });
      if (match.status === "matched") return match.id;
      const row = await insertReturning(trx, "country", { name });
      countries.push(row);
      created.countries.push(name);
      return row.id;
    }

    async function regionId(
      country: string | null,
      names: string[],
    ): Promise<number | null> {
      if (!country || names.length === 0) return null;
      const cId = await countryId(country);
      const scope = (r: { countryId: number }) => r.countryId === cId;
      for (const name of names) {
        const match = matchByName(name, regions, {
          aliases: REGION_ALIASES,
          scope,
        });
        if (match.status === "matched") return match.id;
      }
      // Regions are flat; create the broadest name CellarTracker gave.
      const name = names[names.length - 1];
      const row = await insertReturning(trx, "region", {
        name,
        countryId: cId,
      });
      regions.push(row);
      created.regions.push(`${name} (${country})`);
      return row.id;
    }

    async function grapeId(name: string): Promise<number> {
      const match = matchByName(name, grapes, { aliases: GRAPE_ALIASES });
      if (match.status === "matched") return match.id;
      const row = await insertReturning(trx, "grape", { name });
      grapes.push(row);
      created.grapes.push(name);
      return row.id;
    }

    // --- wines and vintages ----------------------------------------------
    const existingWines = await trx.selectFrom("wine").selectAll().execute();
    const wineIds = new Map<string, number>();
    for (const wine of [...plan.wines.values(), ...notes.extraWines.values()]) {
      if (wineIds.has(wine.key)) continue;
      const makerId = await winemakerId(wine.winemaker);
      const match = existingWines.find(
        (w) =>
          w.wineMakerId === makerId && foldKey(w.name) === foldKey(wine.name),
      );
      if (match) {
        wineIds.set(wine.key, match.id);
        counts.winesMatched++;
        continue;
      }
      const row = await insertReturning(trx, "wine", {
        name: wine.name,
        wineMakerId: makerId,
        regionId: await regionId(wine.country, wine.regionNames),
        type: wine.type,
      });
      existingWines.push(row);
      wineIds.set(wine.key, row.id);
      counts.wines++;
      const seen = new Set<number>();
      for (const grape of wine.grapes) {
        const gId = await grapeId(grape);
        if (seen.has(gId)) continue;
        seen.add(gId);
        await insertReturning(trx, "winegrape", {
          wineId: row.id,
          grapeId: gId,
        });
      }
    }

    const existingVintages = await trx
      .selectFrom("vintage")
      .selectAll()
      .execute();
    const vintageIds = new Map<string, number>();
    for (const vintage of [
      ...plan.vintages.values(),
      ...notes.extraVintages.values(),
    ]) {
      if (vintageIds.has(vintage.key)) continue;
      const wId = wineIds.get(vintage.wineKey)!;
      const match = existingVintages.find(
        (v) => v.wineId === wId && v.year === vintage.year,
      );
      if (match) {
        vintageIds.set(vintage.key, match.id);
        counts.vintagesMatched++;
        continue;
      }
      const row = await insertReturning(trx, "vintage", {
        wineId: wId,
        year: vintage.year,
        drinkFrom: vintage.drinkFrom,
        drinkUntil: vintage.drinkUntil,
      });
      existingVintages.push(row);
      vintageIds.set(vintage.key, row.id);
      counts.vintages++;
    }

    // --- locations and storages ------------------------------------------
    const locations = await trx.selectFrom("location").selectAll().execute();
    const storages = await trx.selectFrom("storage").selectAll().execute();
    const storageIds = new Map<string, number>();
    const tree: string[] = [];
    for (const [locationName, bins] of plan.locations) {
      let location = locations.find(
        (l) => foldKey(l.name) === foldKey(locationName),
      );
      location ??= await insertReturning(trx, "location", {
        name: locationName,
      });
      let root = storages.find(
        (s) =>
          s.parent === null &&
          s.locationId === location.id &&
          foldKey(s.name) === foldKey(locationName),
      );
      root ??= await insertReturning(trx, "storage", {
        name: locationName,
        locationId: location.id,
        parent: null,
      });
      storageIds.set(`${locationName}|`, root.id);
      tree.push(locationName);
      for (const bin of [...bins].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      )) {
        let child = storages.find(
          (s) => s.parent === root.id && foldKey(s.name) === foldKey(bin),
        );
        child ??= await insertReturning(trx, "storage", {
          name: bin,
          locationId: location.id,
          parent: root.id,
        });
        storageIds.set(`${locationName}|${bin}`, child.id);
      }
    }

    // --- bottles -----------------------------------------------------------
    const perStorage = new Map<string, { stored: number; past: number }>();
    for (const bottle of plan.bottles) {
      const storageKey = bottle.storage
        ? `${bottle.storage.location}|${bottle.storage.bin ?? ""}`
        : null;
      await insertReturning(trx, "bottle", {
        vintageId: vintageIds.get(bottle.vintageKey)!,
        purchaseDate: bottle.purchaseDate,
        purchasePrice: bottle.purchasePrice,
        status: bottle.status,
        size: bottle.size,
        storageId: storageKey ? storageIds.get(storageKey)! : null,
        consumedDate: bottle.consumedDate,
        consumedNote: bottle.consumedNote,
      });
      if (storageKey) {
        const c = perStorage.get(storageKey) ?? { stored: 0, past: 0 };
        if (bottle.status === "stored") c.stored++;
        else c.past++;
        perStorage.set(storageKey, c);
      }
    }

    // --- tasting notes -----------------------------------------------------
    for (const note of notes.notes) {
      await insertReturning(trx, "tastingNote", {
        vintageId: vintageIds.get(note.vintageKey)!,
        date: note.date,
        authorId: author!.id,
        score: note.score,
        notes: note.notes,
      });
    }

    // --- settings ----------------------------------------------------------
    if (args.currency) {
      const currency = args.currency.toUpperCase();
      const existing = await trx
        .selectFrom("setting")
        .select("value")
        .where("key", "=", "currency")
        .executeTakeFirst();
      if (existing) {
        await trx
          .updateTable("setting")
          .set({ value: currency })
          .where("key", "=", "currency")
          .execute();
      } else {
        await trx
          .insertInto("setting")
          .values({ key: "currency", value: currency })
          .execute();
      }
    }

    // --- report ------------------------------------------------------------
    const byStatus = new Map<string, number>();
    for (const b of plan.bottles)
      byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1);

    say(args["dry-run"] ? "DRY RUN — nothing will be saved" : "IMPORTED");
    say();
    say(
      `Bottles: ${plan.bottles.length} (${[...byStatus].map(([s, n]) => `${n} ${s}`).join(", ")})`,
    );
    say(
      `Wines: ${counts.wines} new, ${counts.winesMatched} already existed · Vintages: ${counts.vintages} new, ${counts.vintagesMatched} already existed`,
    );
    say(
      `Winemakers: ${created.winemakers.length} new · Countries: ${created.countries.length} new · Regions: ${created.regions.length} new · Grapes: ${created.grapes.length} new`,
    );
    say(
      `Tasting notes: ${notes.notes.length} imported${notes.skipped.length ? `, ${notes.skipped.length} skipped` : ""}${author && notes.notes.length ? ` (author ${author.email})` : ""}`,
    );
    if (args.currency) say(`Currency setting: ${args.currency.toUpperCase()}`);
    say();
    say("Storage (in cellar / past bottles):");
    for (const locationName of tree) {
      const root = perStorage.get(`${locationName}|`) ?? { stored: 0, past: 0 };
      say(`  ${locationName}  ${root.stored} / ${root.past}`);
      for (const bin of [...(plan.locations.get(locationName) ?? [])].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true }),
      )) {
        const c = perStorage.get(`${locationName}|${bin}`) ?? {
          stored: 0,
          past: 0,
        };
        say(`    › ${bin}  ${c.stored} / ${c.past}`);
      }
    }
    say();
    if (created.countries.length)
      say(`New countries: ${created.countries.join(", ")}`);
    if (created.regions.length)
      say(`New regions: ${created.regions.join(", ")}`);
    if (created.grapes.length) say(`New grapes: ${created.grapes.join(", ")}`);
    say(
      `Not imported (no CellarBoss field): ${plan.dropped.bottleNotes} bottle notes, ${plan.dropped.purchaseNotes} purchase notes`,
    );
    for (const w of [...plan.warnings, ...notes.warnings]) say(`! ${w}`);
    for (const s of notes.skipped.slice(0, 20)) say(`- skipped note: ${s}`);

    if (args["dry-run"]) throw new DryRun();
  });
} catch (err) {
  if (!(err instanceof DryRun)) {
    console.error(
      `Import failed, nothing was saved: ${(err as Error).message}`,
    );
    await db.destroy();
    process.exit(1);
  }
}

console.log(report.join("\n"));
await db.destroy();
