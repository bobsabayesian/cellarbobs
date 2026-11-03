"use client";

import { useState } from "react";
import Link from "next/link";
import { GlassWater } from "lucide-react";
import type { Bottle, TastingNote } from "@cellarboss/types";
import { CONSUMED_BOTTLE_STATUSES } from "@cellarboss/validators";
import { formatDate, formatStatus } from "@cellarboss/common/format";
import { useApiQuery } from "@/hooks/use-api-query";
import { useSettingsContext } from "@/contexts/settings-context";
import { queryGate } from "@/lib/functions/query-gate";
import { fuzzyFilter } from "@/lib/functions/fuzzy-filter";
import { wineDisplayName } from "@/lib/functions/strings";
import { getBottles } from "@/lib/api/bottles";
import { getVintages } from "@/lib/api/vintages";
import { getWines } from "@/lib/api/wines";
import { getWinemakers } from "@/lib/api/winemakers";
import { getRegions } from "@/lib/api/regions";
import { getAllTastingNotes } from "@/lib/api/tastingNotes";
import { PageHeader } from "@/components/page/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ConsumedStatus = (typeof CONSUMED_BOTTLE_STATUSES)[number];

type Row = {
  bottle: Bottle;
  name: string;
  year: number | null;
  vintageId: number;
  search: string;
  note: TastingNote | undefined;
};

const MONTH = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Drinking history: every bottle that's been drunk, sold or given away,
 * newest first, grouped by month, with the note recorded when it left the
 * cellar and your tasting note from that day if there is one.
 */
export default function ConsumedPage() {
  const settings = useSettingsContext();
  const dateFormat = String(settings.get("date") ?? "yyyy-MM-dd");
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<ConsumedStatus[]>([
    ...CONSUMED_BOTTLE_STATUSES,
  ]);
  const [year, setYear] = useState("all");

  const queries = [
    useApiQuery({ queryKey: ["bottles"], queryFn: getBottles }),
    useApiQuery({ queryKey: ["vintages"], queryFn: getVintages }),
    useApiQuery({ queryKey: ["wines"], queryFn: getWines }),
    useApiQuery({ queryKey: ["winemakers"], queryFn: getWinemakers }),
    useApiQuery({ queryKey: ["regions"], queryFn: getRegions }),
    useApiQuery({
      queryKey: ["tastingNotes", "all"],
      queryFn: getAllTastingNotes,
    }),
  ] as const;
  const result = queryGate([...queries]);
  if (!result.ready) return result.gate;
  const [bottles, vintages, wines, winemakers, regions, notes] = result.data;

  const vintageMap = new Map(vintages.map((v) => [v.id, v]));
  const wineMap = new Map(wines.map((w) => [w.id, w]));
  const makerMap = new Map(winemakers.map((m) => [m.id, m.name]));
  const regionMap = new Map(regions.map((r) => [r.id, r.name]));
  // A tasting note written for the same vintage on the day it was drunk.
  const noteFor = (vintageId: number, date: string | null) =>
    date
      ? notes.find((n) => n.vintageId === vintageId && n.date.startsWith(date))
      : undefined;

  const consumed: Row[] = bottles
    .filter((b) =>
      (CONSUMED_BOTTLE_STATUSES as readonly string[]).includes(b.status),
    )
    .map((b) => {
      const vintage = vintageMap.get(b.vintageId);
      const wine = vintage ? wineMap.get(vintage.wineId) : undefined;
      const name = wineDisplayName(
        wine ? makerMap.get(wine.wineMakerId) : undefined,
        wine?.name ?? "Unknown wine",
      );
      const region = wine?.regionId ? regionMap.get(wine.regionId) : undefined;
      return {
        bottle: b,
        name,
        year: vintage?.year ?? null,
        vintageId: b.vintageId,
        search: [name, vintage?.year, region, wine?.type, b.consumedNote]
          .filter(Boolean)
          .join(" "),
        note: noteFor(b.vintageId, b.consumedDate),
      };
    })
    .sort((a, b) =>
      (b.bottle.consumedDate ?? "").localeCompare(a.bottle.consumedDate ?? ""),
    );

  const years = [
    ...new Set(
      consumed
        .map((r) => r.bottle.consumedDate?.slice(0, 4))
        .filter((y): y is string => !!y),
    ),
  ].sort((a, b) => b.localeCompare(a));
  const thisYear = String(new Date().getFullYear());
  const thisYearRows = consumed.filter((r) =>
    r.bottle.consumedDate?.startsWith(thisYear),
  );

  const filtered = fuzzyFilter(
    consumed.filter(
      (r) =>
        statuses.includes(r.bottle.status as ConsumedStatus) &&
        (year === "all" || r.bottle.consumedDate?.startsWith(year)),
    ),
    search,
    (r) => r.search,
  );

  // Group by month; bottles without a date go last.
  const groups: { key: string; label: string; rows: Row[] }[] = [];
  for (const row of filtered.items) {
    const date = row.bottle.consumedDate;
    const key = date ? date.slice(0, 7) : "none";
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        label: date ? MONTH.format(new Date(`${key}-01T00:00:00Z`)) : "No date",
        rows: [],
      };
      groups.push(group);
    }
    group.rows.push(row);
  }

  const toggleStatus = (s: ConsumedStatus) =>
    setStatuses((current) =>
      current.includes(s)
        ? current.length > 1
          ? current.filter((x) => x !== s)
          : current
        : [...current, s],
    );

  const countBy = (rows: Row[], s: ConsumedStatus) =>
    rows.filter((r) => r.bottle.status === s).length;

  return (
    <section className="space-y-5">
      <PageHeader title="Consumed" />

      {consumed.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <GlassWater className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Nothing consumed yet</p>
          <p className="text-sm text-muted-foreground">
            Bottles you drink, sell or give away show up here.
          </p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="All time" value={consumed.length} />
            <Stat label={`In ${thisYear}`} value={thisYearRows.length} />
            <Stat
              label={`Drunk in ${thisYear}`}
              value={countBy(thisYearRows, "drunk")}
            />
            <Stat
              label={`Given or sold in ${thisYear}`}
              value={
                countBy(thisYearRows, "gifted") + countBy(thisYearRows, "sold")
              }
            />
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-xs"
              placeholder="Search: wine, region, note…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5" aria-label="Status">
              {CONSUMED_BOTTLE_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={statuses.includes(s)}
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    "h-9 rounded-full border px-3 text-sm",
                    statuses.includes(s)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background",
                  )}
                >
                  {formatStatus(s)} ({countBy(consumed, s)})
                </button>
              ))}
            </div>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-36" aria-label="Year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.fuzzy && filtered.items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing matches “{search}” exactly. Close matches:
            </p>
          )}
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">No bottles match.</p>
          )}

          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
                <span className="font-normal normal-case tracking-normal">
                  {group.rows.length}{" "}
                  {group.rows.length === 1 ? "bottle" : "bottles"}
                </span>
              </h2>
              <ul className="divide-y rounded-lg border">
                {group.rows.map((r) => (
                  <li
                    key={r.bottle.id}
                    className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:gap-4"
                  >
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground sm:w-24">
                      {r.bottle.consumedDate
                        ? formatDate(r.bottle.consumedDate, dateFormat)
                        : "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/vintages/${r.vintageId}`}
                          className="font-medium hover:underline"
                        >
                          {r.name} {r.year ?? "NV"}
                        </Link>
                        {r.bottle.status !== "drunk" && (
                          <Badge variant="secondary">
                            {formatStatus(r.bottle.status)}
                          </Badge>
                        )}
                      </div>
                      {r.bottle.consumedNote && (
                        <p className="text-sm text-muted-foreground">
                          {r.bottle.consumedNote}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      {r.note && (
                        <Link
                          href={`/vintages/${r.vintageId}`}
                          className="tabular-nums hover:underline"
                          title="Your tasting note from that day"
                        >
                          Note: {r.note.score}/10
                        </Link>
                      )}
                      <Link
                        href={`/bottles/${r.bottle.id}`}
                        className="text-muted-foreground hover:underline"
                      >
                        bottle
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
