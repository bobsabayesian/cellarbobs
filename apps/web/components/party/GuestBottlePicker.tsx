"use client";

import { useState } from "react";
import { Download, Loader2, PenLine, Plus } from "lucide-react";
import type { GuestBottleInput, ImportPreview } from "@cellarboss/types";
import { useApiQuery } from "@/hooks/use-api-query";
import { getWines } from "@/lib/api/wines";
import { getWinemakers } from "@/lib/api/winemakers";
import { previewImport } from "@/lib/api/import";
import { fuzzyFilter } from "@/lib/functions/fuzzy-filter";
import { wineDisplayName } from "@/lib/functions/strings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ImportForm } from "@/components/import/ImportForm";
import { cn } from "@/lib/utils";

type GuestBottlePickerProps = {
  /** Returns an error message, or null when the bottle was added. */
  onAdd: (
    bottle: GuestBottleInput,
    wineLabel: string,
  ) => Promise<string | null> | string | null;
};

type NewWineState =
  | { step: "choose" }
  | { step: "loading" }
  | { step: "failed" }
  | { step: "form"; preview: ImportPreview | null; attempt: number };

/**
 * Adds a bottle a guest brings. Either pick a wine already in the wine list
 * and give the vintage year, or describe a new wine: read it from a Vivino or
 * shop link, or type it in. New wines are only created when the party starts
 * (or, mid-party, when added), together with an inventory bottle that's out
 * for the tasting; cancelling the party removes them again.
 */
export function GuestBottlePicker({ onAdd }: GuestBottlePickerProps) {
  const [mode, setMode] = useState<"list" | "new">("list");
  const [broughtBy, setBroughtBy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async (bottle: GuestBottleInput, label: string) => {
    setError(null);
    const refused = await onAdd(
      { ...bottle, broughtBy: broughtBy.trim() || undefined },
      label,
    );
    if (refused) setError(refused);
    else setBroughtBy("");
    return refused;
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-56"
          placeholder="Brought by"
          maxLength={40}
          value={broughtBy}
          onChange={(e) => setBroughtBy(e.target.value)}
        />
        <div
          className="inline-flex rounded-md border p-0.5"
          role="tablist"
          aria-label="Where the wine comes from"
        >
          {(
            [
              ["list", "From your wine list"],
              ["new", "New wine"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "rounded px-3 py-1.5 text-sm",
                mode === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "list" ? <FromWineList onAdd={add} /> : <NewWine onAdd={add} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function FromWineList({
  onAdd,
}: {
  onAdd: (bottle: GuestBottleInput, label: string) => Promise<string | null>;
}) {
  const winesQuery = useApiQuery({ queryKey: ["wines"], queryFn: getWines });
  const makersQuery = useApiQuery({
    queryKey: ["winemakers"],
    queryFn: getWinemakers,
  });
  const [search, setSearch] = useState("");
  const [wineId, setWineId] = useState<number | null>(null);
  const [year, setYear] = useState("");
  const [nonVintage, setNonVintage] = useState(false);

  const makers = new Map((makersQuery.data ?? []).map((m) => [m.id, m.name]));
  const wines = (winesQuery.data ?? []).map((w) => ({
    id: w.id,
    label: wineDisplayName(makers.get(w.wineMakerId), w.name),
    search: `${makers.get(w.wineMakerId) ?? ""} ${w.name} ${w.type}`,
  }));
  const filtered = search.trim()
    ? fuzzyFilter(wines, search, (w) => w.search, { limit: 8 })
    : { items: [], fuzzy: false };
  const matches = filtered.items.slice(0, 8);
  const selected = wines.find((w) => w.id === wineId);
  const yearNumber = Number(year);
  const yearValid =
    nonVintage ||
    (/^\d{4}$/.test(year) && yearNumber >= 1800 && yearNumber <= 2100);

  const submit = async () => {
    if (!selected || !yearValid) return;
    const refused = await onAdd(
      { wineId: selected.id, year: nonVintage ? null : yearNumber },
      `${selected.label} ${nonVintage ? "NV" : year}`,
    );
    if (refused) return;
    setWineId(null);
    setSearch("");
    setYear("");
    setNonVintage(false);
  };

  return (
    <div className="space-y-3">
      {selected ? (
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{selected.label}</span>
          <Button variant="ghost" size="sm" onClick={() => setWineId(null)}>
            Change
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <Input
            placeholder="Find the wine: producer or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filtered.fuzzy && matches.length > 0 && (
            <p className="text-xs text-muted-foreground">Close matches:</p>
          )}
          {matches.length > 0 && (
            <ul className="max-h-56 overflow-y-auto rounded-md border">
              {matches.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => setWineId(w.id)}
                  >
                    {w.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search.trim() && matches.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Not in your wine list. Use <strong>New wine</strong> to add it.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-32"
          placeholder="Vintage"
          inputMode="numeric"
          maxLength={4}
          disabled={nonVintage}
          value={nonVintage ? "" : year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
          aria-invalid={!!year && !yearValid}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={nonVintage}
            onCheckedChange={(v) => setNonVintage(v === true)}
          />
          NV
        </label>
        <Button
          variant="outline"
          disabled={!selected || !yearValid}
          onClick={submit}
        >
          <Plus /> Add guest bottle
        </Button>
      </div>
    </div>
  );
}

function NewWine({
  onAdd,
}: {
  onAdd: (bottle: GuestBottleInput, label: string) => Promise<string | null>;
}) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<NewWineState>({ step: "choose" });
  const [attempts, setAttempts] = useState(0);

  const open = (preview: ImportPreview | null) => {
    const attempt = attempts + 1;
    setAttempts(attempt);
    setState({ step: "form", preview, attempt });
  };

  if (state.step === "form") {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {state.preview
              ? "Check what was read from the link."
              : "Describe the wine."}{" "}
            It&apos;s added to your wine list with the party, and removed if the
            party is cancelled.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setState({ step: "choose" })}
          >
            Back
          </Button>
        </div>
        <ImportForm
          key={state.attempt}
          preview={state.preview}
          commitLabel="Add guest bottle"
          onCommit={async (commit, label) => {
            const refused = await onAdd({ newWine: commit }, label);
            if (!refused) {
              setUrl("");
              setState({ step: "choose" });
            }
            return refused;
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!url.trim()) return;
          setState({ step: "loading" });
          const result = await previewImport(url.trim()).catch(() => null);
          if (result?.ok) open(result.data);
          else setState({ step: "failed" });
        }}
      >
        <Input
          className="min-w-64 flex-1"
          type="url"
          placeholder="Paste a Vivino or shop link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!url.trim() || state.step === "loading"}
        >
          {state.step === "loading" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Download />
          )}
          Read link
        </Button>
      </form>
      {state.step === "failed" && (
        <p className="text-sm text-destructive">
          Couldn&apos;t read that page. Try another link, or type it in.
        </p>
      )}
      <Button variant="ghost" onClick={() => open(null)}>
        <PenLine /> Type it in instead
      </Button>
    </div>
  );
}
