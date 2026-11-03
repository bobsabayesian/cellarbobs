"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type {
  GuestBottleInput,
  PartyFormatId,
  PartyPacing,
  PartyScoreScale,
  Storage,
} from "@cellarboss/types";
import { PARTY_MAX_BOTTLES, PARTY_MIN_BOTTLES } from "@cellarboss/validators";
import { getStorageAncestry } from "@cellarboss/common/storages";
import { useApiQuery } from "@/hooks/use-api-query";
import { queryGate } from "@/lib/functions/query-gate";
import { formatDateOnly } from "@/lib/functions/date";
import { fuzzyFilter } from "@/lib/functions/fuzzy-filter";
import { wineDisplayName } from "@/lib/functions/strings";
import { getRegions } from "@/lib/api/regions";
import { getCountries } from "@/lib/api/countries";
import { getGrapes } from "@/lib/api/grapes";
import { getWineGrapes } from "@/lib/api/winegrapes";
import { getBottles } from "@/lib/api/bottles";
import { getVintages } from "@/lib/api/vintages";
import { getWines } from "@/lib/api/wines";
import { getWinemakers } from "@/lib/api/winemakers";
import { getStorages } from "@/lib/api/storages";
import { createParty } from "@/lib/api/parties";
import { PageHeader } from "@/components/page/PageHeader";
import { GuestBottlePicker } from "@/components/party/GuestBottlePicker";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Choice = {
  id: number;
  name: string;
  storage: string;
  search: string;
};

export default function NewPartyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const queries = [
    useApiQuery({ queryKey: ["bottles"], queryFn: getBottles }),
    useApiQuery({ queryKey: ["vintages"], queryFn: getVintages }),
    useApiQuery({ queryKey: ["wines"], queryFn: getWines }),
    useApiQuery({ queryKey: ["winemakers"], queryFn: getWinemakers }),
    useApiQuery({ queryKey: ["storages"], queryFn: getStorages }),
    useApiQuery({ queryKey: ["regions"], queryFn: getRegions }),
    useApiQuery({ queryKey: ["countries"], queryFn: getCountries }),
    useApiQuery({ queryKey: ["grapes"], queryFn: getGrapes }),
    useApiQuery({ queryKey: ["winegrapes"], queryFn: getWineGrapes }),
  ] as const;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(formatDateOnly(new Date()));
  const [scale, setScale] = useState<PartyScoreScale>(100);
  const [format, setFormat] = useState<PartyFormatId>("beginner");
  const [pacing, setPacing] = useState<PartyPacing>("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guests, setGuests] = useState<
    { input: GuestBottleInput; label: string }[]
  >([]);

  const result = queryGate([...queries]);
  if (!result.ready) return result.gate;

  const [
    bottles,
    vintages,
    wines,
    winemakers,
    storages,
    regions,
    countries,
    grapes,
    winegrapes,
  ] = result.data;
  const regionMap = new Map(regions.map((r) => [r.id, r]));
  const countryMap = new Map(countries.map((c) => [c.id, c.name]));
  const grapeMap = new Map(grapes.map((g) => [g.id, g.name]));
  const grapesByWine = new Map<number, string[]>();
  for (const wg of winegrapes)
    grapesByWine.set(wg.wineId, [
      ...(grapesByWine.get(wg.wineId) ?? []),
      grapeMap.get(wg.grapeId) ?? "",
    ]);
  const vintageMap = new Map(vintages.map((v) => [v.id, v]));
  const wineMap = new Map(wines.map((w) => [w.id, w]));
  const makerMap = new Map(winemakers.map((m) => [m.id, m]));
  const storageMap = new Map<number, Storage>(storages.map((s) => [s.id, s]));
  const choices: Choice[] = bottles
    .filter((b) => b.status === "stored")
    .map((b) => {
      const vintage = vintageMap.get(b.vintageId);
      const wine = vintage ? wineMap.get(vintage.wineId) : undefined;
      const maker = wine ? makerMap.get(wine.wineMakerId) : undefined;
      const name =
        `${wineDisplayName(maker?.name, wine?.name ?? "")} ${vintage?.year ?? "NV"}`.trim();
      const storage =
        getStorageAncestry(b.storageId, storageMap)
          .map((s) => s.name)
          .join(" › ") || "No storage";
      const region = wine?.regionId ? regionMap.get(wine.regionId) : undefined;
      // Everything a host might type: producer, wine, year, bin, region,
      // country, type and grapes.
      const search = [
        name,
        storage,
        region?.name,
        region ? countryMap.get(region.countryId) : undefined,
        wine?.type,
        ...(wine ? (grapesByWine.get(wine.id) ?? []) : []),
      ]
        .filter(Boolean)
        .join(" ");
      return { id: b.id, name, storage, search };
    })
    .sort(
      (a, b) =>
        a.storage.localeCompare(b.storage, undefined, { numeric: true }) ||
        a.name.localeCompare(b.name),
    );

  const filtered = fuzzyFilter(choices, filter, (c) => c.search);
  const matching = new Set(filtered.items.map((c) => c.id));
  // Picked bottles stay visible whatever the filter says.
  const visible = choices.filter(
    (c) => selected.includes(c.id) || matching.has(c.id),
  );
  const groups = new Map<string, Choice[]>();
  for (const c of visible)
    groups.set(c.storage, [...(groups.get(c.storage) ?? []), c]);

  const toggle = (id: number) =>
    setSelected((s) =>
      s.includes(id)
        ? s.filter((x) => x !== id)
        : s.length + guests.length >= PARTY_MAX_BOTTLES
          ? s
          : [...s, id],
    );

  const total = selected.length + guests.length;
  const canSubmit =
    title.trim() &&
    total >= PARTY_MIN_BOTTLES &&
    total <= PARTY_MAX_BOTTLES &&
    !busy;

  return (
    <section className="space-y-6">
      <PageHeader title="New Tasting Party" />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            placeholder="Fall Nebbiolo Blind Tasting"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {format === "advanced" && (
          <div className="space-y-1.5">
            <Label>Guests score with</Label>
            <Select
              value={String(scale)}
              onValueChange={(v) => setScale(Number(v) as PartyScoreScale)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100 points</SelectItem>
                <SelectItem value="5">5 stars</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Tasting format</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              [
                "beginner",
                "Beginner",
                "One screen: colour, aromas, sweetness, body and tannin, then “loved it / liked it / not for me”. Quick and friendly for a mixed crowd.",
              ],
              [
                "advanced",
                "Advanced",
                "Four steps (look, nose, palate, conclusion) with structure, finish and quality, scored out of 100 or 5 stars.",
              ],
            ] as const
          ).map(([value, title, description]) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${format === value ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <input
                type="radio"
                name="format"
                value={value}
                checked={format === value}
                onChange={() => setFormat(value)}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-muted-foreground">
                  {description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Pacing</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              [
                "all",
                "All at once",
                "Guests see every bottle from the start and taste in any order.",
              ],
              [
                "sequential",
                "One at a time",
                "Guests see nothing until you pour. Each bottle appears on their phones as you pour it from the party page.",
              ],
            ] as const
          ).map(([value, title, description]) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${pacing === value ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <input
                type="radio"
                name="pacing"
                value={value}
                checked={pacing === value}
                onChange={() => setPacing(value)}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-muted-foreground">
                  {description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Cellar bottles</h2>
            <p className="text-sm text-muted-foreground">
              Stored bottles only. {selected.length} selected. They&apos;ll show
              as “Out (In Tasting)” until the party ends.
            </p>
          </div>
          <Input
            className="max-w-xs"
            placeholder="Filter: Bordeaux, nebbiolo, Terroir…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {filtered.fuzzy && filtered.items.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing matches “{filter}” exactly. Close matches:
          </p>
        )}
        <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
          {[...groups].map(([storage, items]) => (
            <div key={storage}>
              <div className="sticky top-0 bg-muted px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {storage}
              </div>
              {items.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.includes(c.id)}
                    onCheckedChange={() => toggle(c.id)}
                    disabled={
                      !selected.includes(c.id) && total >= PARTY_MAX_BOTTLES
                    }
                  />
                  <span className="text-sm">{c.name}</span>
                </label>
              ))}
            </div>
          ))}
          {visible.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              No stored bottles match.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="font-semibold">Guest bottles</h2>
          <p className="text-sm text-muted-foreground">
            Bottles guests are bringing, from your wine list or new. Each gets a
            bottle in your inventory marked “Out (In Tasting)”, recorded as
            drunk when the party ends. Cancelling removes the bottle and any
            wine the party created. You can also add them during the party.
          </p>
        </div>
        {guests.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {guests.map((g, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>
                  {g.label}
                  {"newWine" in g.input && (
                    <Badge variant="secondary" className="ml-2">
                      new wine
                    </Badge>
                  )}
                  <span className="text-muted-foreground">
                    {" "}
                    · {g.input.broughtBy || "a guest"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${g.label}`}
                  onClick={() =>
                    setGuests((list) => list.filter((_, j) => j !== i))
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {total < PARTY_MAX_BOTTLES && (
          <GuestBottlePicker
            onAdd={(input, label) => {
              setGuests((list) => [...list, { input, label }]);
              return null;
            }}
          />
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {total} of {PARTY_MAX_BOTTLES} bottles · at least {PARTY_MIN_BOTTLES}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        size="lg"
        disabled={!canSubmit}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await createParty({
            title: title.trim(),
            date,
            scoreScale: scale,
            format,
            pacing,
            bottleIds: selected,
            guestBottles: guests.map((g) => g.input),
          });
          setBusy(false);
          if (!res.ok) {
            setError(res.error.message);
            return;
          }
          await queryClient.invalidateQueries({ queryKey: ["bottles"] });
          await queryClient.invalidateQueries({ queryKey: ["parties"] });
          router.push(`/parties/${res.data.id}`);
        }}
      >
        {busy && <Loader2 className="animate-spin" />} Start the party
      </Button>
    </section>
  );
}
