"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Hourglass,
  MapPin,
  NotebookPen,
  Plus,
} from "lucide-react";
import type { Bottle, VintageDetail, Wine, WineMaker } from "@cellarboss/types";
import type { Storage } from "@cellarboss/types";
import { getStorageAncestry } from "@cellarboss/common/storages";
import { fuzzyFilter } from "@/lib/functions/fuzzy-filter";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import {
  formatBottleSize,
  formatDrinkingStatus,
  formatDrinkingWindow,
  formatStatus,
  formatWineType,
} from "@/lib/functions/format";
import { WINE_TYPE_COLORS } from "@/lib/constants/wine-colouring";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DrinkBottleDialog } from "./DrinkBottleDialog";

type Props = {
  bottles: Bottle[];
  vintages: VintageDetail[];
  wines: Wine[];
  winemakers: WineMaker[];
  storages: Storage[];
  /** Whether the user may change bottles in this storage. */
  canEdit?: (storageId: number | null) => boolean;
  /** Consumed bottles are hidden by default; offer a switch when some are. */
  consumedCount: number;
  showingConsumed: boolean;
  onToggleConsumed?: () => void;
};

type Group = {
  vintage: VintageDetail;
  wine: Wine;
  maker: string;
  bottles: (Bottle & { path: string })[];
  paths: string[];
  ready: boolean;
  search: string;
};

const PAGE_SIZE = 20;

/** The last two storage names, e.g. "Rack 3 › Shelf 2": the useful part. */
function shortPath(names: string[]) {
  return names.slice(-2).join(" › ");
}

function currentPath() {
  return encodeURIComponent(window.location.pathname + window.location.search);
}

/**
 * The bottle list for phones. Identical bottles are grouped into one card per
 * wine and vintage ("Barolo 2017 ×3 · Rack 12, Rack 13") that opens to the
 * individual bottles. Search, quick filters and an Add note button replace
 * the wide table, its checkboxes and bulk actions.
 */
export function MobileBottleList({
  bottles,
  vintages,
  wines,
  winemakers,
  storages,
  canEdit = () => true,
  consumedCount,
  showingConsumed,
  onToggleConsumed,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const year = new Date().getFullYear();

  const groups = useMemo<Group[]>(() => {
    const vintageById = new Map(vintages.map((v) => [v.id, v]));
    const wineById = new Map(wines.map((w) => [w.id, w]));
    const makerById = new Map(winemakers.map((m) => [m.id, m.name]));
    const storageById = new Map(storages.map((s) => [s.id, s]));

    const byVintage = new Map<number, Group["bottles"]>();
    for (const b of bottles) {
      const path =
        b.storageId === null
          ? ""
          : shortPath(
              getStorageAncestry(b.storageId, storageById).map((s) => s.name),
            );
      byVintage.set(b.vintageId, [
        ...(byVintage.get(b.vintageId) ?? []),
        { ...b, path },
      ]);
    }

    const result: Group[] = [];
    for (const [vintageId, list] of byVintage) {
      const vintage = vintageById.get(vintageId);
      const wine = vintage ? wineById.get(vintage.wineId) : undefined;
      if (!vintage || !wine) continue;
      const maker = makerById.get(wine.wineMakerId) ?? "";
      const paths = [...new Set(list.map((b) => b.path).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true }),
      );
      result.push({
        vintage,
        wine,
        maker,
        bottles: list.sort((a, b) =>
          a.path.localeCompare(b.path, undefined, { numeric: true }),
        ),
        paths,
        ready:
          list.some((b) => b.status === "stored") &&
          formatDrinkingStatus(vintage.drinkFrom, vintage.drinkUntil, year) ===
            "drinkable",
        search: [
          wine.name,
          maker,
          vintage.year ?? "NV",
          formatWineType(wine.type),
          ...paths,
        ].join(" "),
      });
    }
    return result.sort(
      (a, b) =>
        a.wine.name.localeCompare(b.wine.name) ||
        (b.vintage.year ?? 0) - (a.vintage.year ?? 0),
    );
  }, [bottles, vintages, wines, winemakers, storages, year]);

  const presentStatuses = useMemo(
    () => [...new Set(bottles.map((b) => b.status))],
    [bottles],
  );
  const presentTypes = useMemo(
    () => [...new Set(groups.map((g) => g.wine.type))],
    [groups],
  );

  // Memoized: the infinite scroll restarts whenever it gets a new array.
  const filtered = useMemo(
    () =>
      fuzzyFilter(
        groups
          .filter(
            (g) =>
              (!readyOnly || g.ready) &&
              (types.length === 0 || types.includes(g.wine.type)),
          )
          .map((g) =>
            statuses.length === 0
              ? g
              : {
                  ...g,
                  bottles: g.bottles.filter((b) => statuses.includes(b.status)),
                },
          )
          .filter((g) => g.bottles.length > 0),
        search,
        (g) => g.search,
      ),
    [groups, readyOnly, types, statuses, search],
  );
  const { visibleItems, sentinelRef, hasMore } = useInfiniteScroll(
    filtered.items,
    PAGE_SIZE,
  );
  const total = filtered.items.reduce((n, g) => n + g.bottles.length, 0);

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

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
      <div className="flex gap-2">
        <Input
          type="search"
          placeholder="Search bottles, bins…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 flex-1 text-base"
        />
        <Link
          href="/bottles/new"
          aria-label="Add bottle"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border touch-manipulation"
        >
          <Plus className="h-5 w-5" />
        </Link>
      </div>
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        aria-label="Quick filters"
      >
        {chip("Ready to drink", readyOnly, () => setReadyOnly((v) => !v))}
        {presentStatuses.map((s) =>
          chip(formatStatus(s), statuses.includes(s), () =>
            setStatuses((cur) => toggle(cur, s)),
          ),
        )}
        {presentTypes.map((t) =>
          chip(formatWineType(t), types.includes(t), () =>
            setTypes((cur) => toggle(cur, t)),
          ),
        )}
        {onToggleConsumed &&
          consumedCount > 0 &&
          chip(
            `Consumed (${consumedCount})`,
            showingConsumed,
            onToggleConsumed,
          )}
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.fuzzy && filtered.items.length > 0
          ? `Nothing matches “${search}” exactly. Close matches: `
          : ""}
        {total} {total === 1 ? "bottle" : "bottles"} · {filtered.items.length}{" "}
        {filtered.items.length === 1 ? "wine" : "wines"}
      </p>

      <ul className="space-y-3">
        {visibleItems.map((g) => {
          const expanded = open.has(g.vintage.id);
          const status = formatDrinkingStatus(
            g.vintage.drinkFrom,
            g.vintage.drinkUntil,
            year,
          );
          const counts = new Map<string, number>();
          for (const b of g.bottles)
            counts.set(b.status, (counts.get(b.status) ?? 0) + 1);
          return (
            <li
              key={g.vintage.id}
              className="space-y-3 rounded-xl border bg-card p-3.5"
            >
              <Link
                href={`/vintages/${g.vintage.id}`}
                className="block space-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-medium leading-snug">
                    {g.wine.name}{" "}
                    <span className="tabular-nums">
                      {g.vintage.year ?? "NV"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 pt-0.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-sm font-medium tabular-nums">
                      ×{g.bottles.length}
                    </span>
                    <span
                      className={cn(
                        "h-3 w-3 rounded-full",
                        WINE_TYPE_COLORS[g.wine.type],
                      )}
                      title={formatWineType(g.wine.type)}
                    />
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">{g.maker}</div>
              </Link>

              <div className="space-y-1 text-sm">
                {status !== "unknown" && (
                  <div className="flex items-center gap-1.5">
                    {status === "drinkable" && (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    )}
                    {status === "wait" && (
                      <Hourglass className="h-3.5 w-3.5 text-yellow-500" />
                    )}
                    {status === "past" && (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    {formatDrinkingWindow(
                      g.vintage.drinkFrom,
                      g.vintage.drinkUntil,
                    )}
                  </div>
                )}
                {g.paths.length > 0 && (
                  <div className="flex items-start gap-1.5 text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {g.paths.slice(0, 3).join(", ")}
                      {g.paths.length > 3 && ` +${g.paths.length - 3} more`}
                    </span>
                  </div>
                )}
                {(counts.size > 1 || !counts.has("stored")) && (
                  <div className="text-muted-foreground">
                    {[...counts]
                      .map(([s, n]) => `${n} ${formatStatus(s).toLowerCase()}`)
                      .join(" · ")}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/tasting-notes/new?vintageId=${g.vintage.id}&returnTo=${currentPath()}`,
                    )
                  }
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-medium text-primary-foreground touch-manipulation"
                >
                  <NotebookPen className="h-4 w-4" /> Add note
                </button>
                <DrinkBottleDialog
                  variant="button"
                  name={`${g.wine.name} ${g.vintage.year ?? "NV"}`}
                  wineId={g.wine.id}
                  bottles={g.bottles
                    .filter((b) => canEdit(b.storageId))
                    .map((b) => ({
                      ...b,
                      label: [
                        b.path || "No storage",
                        b.size !== "standard" && formatBottleSize(b.size),
                        b.status !== "stored" && formatStatus(b.status),
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    }))}
                />
                {g.bottles.length > 1 && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Hide" : "Show"} ${g.bottles.length} bottles`}
                    onClick={() =>
                      setOpen((cur) => {
                        const next = new Set(cur);
                        if (!next.delete(g.vintage.id)) next.add(g.vintage.id);
                        return next;
                      })
                    }
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-[15px] touch-manipulation"
                  >
                    Bottles
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        expanded && "rotate-180",
                      )}
                    />
                  </button>
                )}
              </div>

              {expanded && (
                <ul className="divide-y rounded-lg border">
                  {g.bottles.map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/bottles/${b.id}`}
                        className="flex items-center justify-between gap-3 p-3 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {b.path || "No storage"}
                          {b.size !== "standard" && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {formatBottleSize(b.size)}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {formatStatus(b.status)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {filtered.items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No bottles match.
        </p>
      )}
      {hasMore && <div ref={sentinelRef} className="h-8" aria-hidden />}
    </div>
  );
}
