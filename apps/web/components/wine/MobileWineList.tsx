"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  NotebookPen,
  Plus,
  AlertCircle,
  Hourglass,
} from "lucide-react";
import type {
  Region,
  Country,
  VintageDetail,
  WineDetail,
  WineMaker,
} from "@cellarboss/types";
import { fuzzyFilter } from "@/lib/functions/fuzzy-filter";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import {
  formatDrinkingStatus,
  formatDrinkingWindow,
  formatWineType,
} from "@/lib/functions/format";
import { WINE_TYPE_COLORS } from "@/lib/constants/wine-colouring";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  wines: WineDetail[];
  vintages: VintageDetail[];
  winemakers: WineMaker[];
  regions: Region[];
  countries: Country[];
};

type Item = {
  wine: WineDetail;
  maker: string;
  place: string;
  vintages: VintageDetail[];
  stored: number;
  ready: boolean;
  search: string;
};

const PAGE_SIZE = 20;

/** Where to come back to after writing a note from here. */
function currentPath() {
  return encodeURIComponent(window.location.pathname + window.location.search);
}

/**
 * The wine list for phones: one card per wine instead of a wide table, with
 * search, quick filters, and an "Add note" button right on the card. Wines
 * with several vintages open to pick the one you're tasting.
 */
export function MobileWineList({
  wines,
  vintages,
  winemakers,
  regions,
  countries,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [inCellar, setInCellar] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const year = new Date().getFullYear();

  const items = useMemo<Item[]>(() => {
    const makerName = new Map(winemakers.map((m) => [m.id, m.name]));
    const regionById = new Map(regions.map((r) => [r.id, r]));
    const countryName = new Map(countries.map((c) => [c.id, c.name]));

    const byWine = new Map<number, VintageDetail[]>();
    for (const v of vintages)
      byWine.set(v.wineId, [...(byWine.get(v.wineId) ?? []), v]);

    return wines
      .map((wine) => {
        const list = [...(byWine.get(wine.id) ?? [])].sort(
          (a, b) => (b.year ?? 0) - (a.year ?? 0),
        );
        const region = wine.regionId
          ? regionById.get(wine.regionId)
          : undefined;
        const country = region ? countryName.get(region.countryId) : undefined;
        const maker = makerName.get(wine.wineMakerId) ?? "";
        const place = [region?.name, country].filter(Boolean).join(", ");
        return {
          wine,
          maker,
          place,
          vintages: list,
          stored: list.reduce((n, v) => n + v.bottles.stored, 0),
          ready: list.some(
            (v) =>
              v.bottles.stored > 0 &&
              formatDrinkingStatus(v.drinkFrom, v.drinkUntil, year) ===
                "drinkable",
          ),
          search: [wine.name, maker, place, formatWineType(wine.type)].join(
            " ",
          ),
        };
      })
      .sort((a, b) => a.wine.name.localeCompare(b.wine.name));
  }, [wines, vintages, winemakers, regions, countries, year]);

  const presentTypes = useMemo(
    () => [...new Set(wines.map((w) => w.type))],
    [wines],
  );
  // Memoized: the infinite scroll restarts whenever it's handed a new array.
  const filtered = useMemo(
    () =>
      fuzzyFilter(
        items.filter(
          (i) =>
            (!inCellar || i.stored > 0) &&
            (!readyOnly || i.ready) &&
            (types.length === 0 || types.includes(i.wine.type)),
        ),
        search,
        (i) => i.search,
      ),
    [items, inCellar, readyOnly, types, search],
  );
  const { visibleItems, sentinelRef, hasMore } = useInfiniteScroll(
    filtered.items,
    PAGE_SIZE,
  );

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const addNote = (vintageId: number) =>
    router.push(
      `/tasting-notes/new?vintageId=${vintageId}&returnTo=${currentPath()}`,
    );

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-10 shrink-0 rounded-full border px-3.5 text-sm touch-manipulation",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <Input
        type="search"
        placeholder="Search wines…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-11 text-base"
      />
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        aria-label="Quick filters"
      >
        {chip("In cellar", inCellar, () => setInCellar((v) => !v))}
        {chip("Ready to drink", readyOnly, () => setReadyOnly((v) => !v))}
        {presentTypes.map((t) =>
          chip(formatWineType(t), types.includes(t), () =>
            setTypes((cur) => toggle(cur, t)),
          ),
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.fuzzy && filtered.items.length > 0
          ? `Nothing matches “${search}” exactly. Close matches: `
          : ""}
        {filtered.items.length} {filtered.items.length === 1 ? "wine" : "wines"}
      </p>

      <ul className="space-y-3">
        {visibleItems.map((item) => {
          const { wine } = item;
          const expanded = open.has(wine.id);
          const onlyVintage =
            item.vintages.length === 1 ? item.vintages[0] : null;
          return (
            <li
              key={wine.id}
              className="space-y-3 rounded-xl border bg-card p-3.5"
            >
              <Link href={`/wines/${wine.id}`} className="block space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-medium leading-snug">
                    {wine.name}
                  </span>
                  <span
                    className={cn(
                      "mt-1.5 h-3 w-3 shrink-0 rounded-full",
                      WINE_TYPE_COLORS[wine.type],
                    )}
                    title={formatWineType(wine.type)}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  {[item.maker, item.place].filter(Boolean).join(" · ")}
                </div>
              </Link>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="tabular-nums">{item.stored} in cellar</span>
                {item.ready && (
                  <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
                    <Check className="h-3.5 w-3.5" /> Ready to drink
                  </span>
                )}
                {wine.tastingNotesCount > 0 && (
                  <span className="text-muted-foreground">
                    {wine.tastingNotesCount}{" "}
                    {wine.tastingNotesCount === 1 ? "note" : "notes"}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                {item.vintages.length === 0 ? (
                  <Link
                    href={`/vintages/new?wineId=${wine.id}`}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border text-[15px] font-medium touch-manipulation"
                  >
                    <Plus className="h-4 w-4" /> Add vintage
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-expanded={onlyVintage ? undefined : expanded}
                    onClick={() =>
                      onlyVintage
                        ? addNote(onlyVintage.id)
                        : setOpen((cur) => {
                            const next = new Set(cur);
                            if (!next.delete(wine.id)) next.add(wine.id);
                            return next;
                          })
                    }
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-medium text-primary-foreground touch-manipulation"
                  >
                    <NotebookPen className="h-4 w-4" /> Add note
                    {!onlyVintage && (
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          expanded && "rotate-180",
                        )}
                      />
                    )}
                  </button>
                )}
              </div>

              {expanded && !onlyVintage && (
                <ul className="divide-y rounded-lg border">
                  {item.vintages.map((v) => {
                    const status = formatDrinkingStatus(
                      v.drinkFrom,
                      v.drinkUntil,
                      year,
                    );
                    return (
                      <li
                        key={v.id}
                        className="flex items-center justify-between gap-3 p-2.5"
                      >
                        <div className="min-w-0 text-sm">
                          <div className="font-medium tabular-nums">
                            {v.year ?? "NV"}{" "}
                            <span className="font-normal text-muted-foreground">
                              · {v.bottles.stored} in cellar
                            </span>
                          </div>
                          {status !== "unknown" && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {status === "drinkable" && (
                                <Check className="h-3 w-3 text-green-500" />
                              )}
                              {status === "wait" && (
                                <Hourglass className="h-3 w-3 text-yellow-500" />
                              )}
                              {status === "past" && (
                                <AlertCircle className="h-3 w-3 text-red-500" />
                              )}
                              {formatDrinkingWindow(v.drinkFrom, v.drinkUntil)}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => addNote(v.id)}
                          aria-label={`Add note for ${v.year ?? "NV"}`}
                          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium touch-manipulation"
                        >
                          <NotebookPen className="h-4 w-4" /> Note
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {filtered.items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No wines match.
        </p>
      )}
      {hasMore && <div ref={sentinelRef} className="h-8" aria-hidden />}
    </div>
  );
}
