"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MapPin, Minus, Plus, Wine } from "lucide-react";
import type { SharedCellar, SharedVintage } from "@cellarboss/types";
import type { ApiResult } from "@cellarboss/common";
import { useApiQuery } from "@/hooks/use-api-query";
import { fuzzyFilter } from "@/lib/functions/fuzzy-filter";
import {
  getSharedCellar,
  joinShare,
  markShared,
  unmarkShared,
} from "@/lib/api/share-public";
import { formatExpiry } from "@/components/share/expiry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Filter = "all" | "ready" | "mine";

function readiness(v: SharedVintage, year: number) {
  if (v.drinkFrom === null && v.drinkUntil === null) return null;
  if (v.drinkFrom !== null && year < v.drinkFrom) return "young" as const;
  if (v.drinkUntil !== null && year > v.drinkUntil) return "past" as const;
  return "ready" as const;
}

/**
 * The page behind a shared link: browse the stored cellar and mark bottles
 * to have set aside. No login; the name you give is kept in a cookie.
 */
export default function SharedCellarPage() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cellarQuery = useApiQuery({
    queryKey: ["sharedCellar", token],
    queryFn: () => getSharedCellar(token),
    refetchInterval: 15000,
    retry: false,
  });

  if (cellarQuery.isPending)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!cellarQuery.data)
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <Wine className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium">
          {cellarQuery.error?.message ?? "This link doesn't work"}
        </p>
        <p className="text-sm text-muted-foreground">
          Ask whoever sent it for a new one.
        </p>
      </div>
    );
  const cellar = cellarQuery.data;
  const joined = cellar.viewerName !== null;
  const capReached =
    cellar.maxMarks !== null && (cellar.myMarks ?? 0) >= cellar.maxMarks;
  const year = new Date().getFullYear();

  const act = async (
    vintageId: number,
    action: () => Promise<ApiResult<SharedCellar>>,
  ) => {
    setError(null);
    setBusy(vintageId);
    const res = await action();
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      await cellarQuery.refetch();
      return;
    }
    queryClient.setQueryData(["sharedCellar", token], res.data);
  };

  const shown = fuzzyFilter(
    cellar.vintages.filter((v) =>
      filter === "mine"
        ? v.mine.length > 0
        : filter === "ready"
          ? readiness(v, year) === "ready"
          : true,
    ),
    search,
    (v) =>
      [
        v.wine.winemaker,
        v.wine.wineName,
        v.wine.year,
        v.wine.type,
        v.wine.region,
        v.wine.country,
        ...v.wine.grapes,
      ]
        .filter(Boolean)
        .join(" "),
  );
  const mineCount = cellar.vintages.filter((v) => v.mine.length > 0).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{cellar.title}</h1>
        {cellar.message && (
          <p className="whitespace-pre-line text-muted-foreground">
            {cellar.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Link works until {formatExpiry(cellar.expiresAt)}
        </p>
      </header>

      {joined ? (
        <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 border-b bg-muted/95 px-4 py-2 text-sm backdrop-blur">
          <span>
            Marking as <strong>{cellar.viewerName}</strong>
          </span>
          <span className="tabular-nums">
            {cellar.myMarks ?? 0}
            {cellar.maxMarks !== null && ` of ${cellar.maxMarks}`} marked
          </span>
        </div>
      ) : (
        <JoinForm
          token={token}
          maxMarks={cellar.maxMarks}
          onJoined={() => cellarQuery.refetch()}
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <Input
          type="search"
          placeholder="Search: wine, grape, region…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-background"
        />
        <div className="flex gap-1.5" aria-label="Show">
          {(
            [
              ["all", `All (${cellar.vintages.length})`],
              ["ready", "Ready to drink"],
              ...(joined ? [["mine", `My picks (${mineCount})`]] : []),
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "h-9 rounded-full border px-3 text-sm",
                filter === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.fuzzy && shown.items.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing matches “{search}” exactly. Close matches:
        </p>
      )}
      {shown.items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No wines match.
        </p>
      )}

      <ul className="space-y-3">
        {shown.items.map((v) => (
          <VintageCard
            key={v.vintageId}
            vintage={v}
            year={year}
            joined={joined}
            capReached={capReached}
            busy={busy === v.vintageId}
            onMark={() =>
              act(v.vintageId, () => markShared(token, v.vintageId))
            }
            onUnmark={() =>
              act(v.vintageId, () => unmarkShared(token, v.mine[0]))
            }
          />
        ))}
      </ul>
    </div>
  );
}

function JoinForm({
  token,
  maxMarks,
  onJoined,
}: {
  token: string;
  maxMarks: number | null;
  onJoined: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="space-y-2 rounded-lg border bg-background p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const res = await joinShare(token, name.trim());
        setSaving(false);
        if (!res.ok) setError(res.error.message);
        else onJoined();
      }}
    >
      <label htmlFor="share-name" className="text-sm font-medium">
        Your name, to mark bottles
        {maxMarks !== null &&
          ` (up to ${maxMarks} ${maxMarks === 1 ? "bottle" : "bottles"})`}
      </label>
      <div className="flex gap-2">
        <Input
          id="share-name"
          required
          maxLength={40}
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={saving || !name.trim()}>
          Start
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

const READY_LABEL = {
  ready: "Ready to drink",
  young: "Still young",
  past: "Past its window",
} as const;

function VintageCard({
  vintage: v,
  year,
  joined,
  capReached,
  busy,
  onMark,
  onUnmark,
}: {
  vintage: SharedVintage;
  year: number;
  joined: boolean;
  capReached: boolean;
  busy: boolean;
  onMark: () => void;
  onUnmark: () => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const ready = readiness(v, year);
  const window =
    v.drinkFrom !== null || v.drinkUntil !== null
      ? `${v.drinkFrom ?? "…"}–${v.drinkUntil ?? "…"}`
      : null;
  const takenText = v.taken
    .map((t) => `${t.count} set aside${t.name ? ` for ${t.name}` : ""}`)
    .join(" · ");
  const marked = v.mine.length;

  return (
    <li
      className={cn(
        "space-y-2 rounded-lg border bg-background p-4",
        marked > 0 && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">
            {v.wine.winemaker} {v.wine.wineName} {v.wine.year ?? "NV"}
          </div>
          <div className="text-sm text-muted-foreground">
            {[
              v.wine.type,
              [v.wine.region, v.wine.country].filter(Boolean).join(", "),
              v.wine.grapes.join(", "),
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {marked > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            <Check className="h-3 w-3" /> {marked > 1 ? `${marked} ` : ""}
            yours
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {window && (
          <span
            className={cn(
              ready === "ready" && "text-green-700 dark:text-green-400",
              ready === "past" && "text-amber-700 dark:text-amber-400",
            )}
          >
            {ready && READY_LABEL[ready]} ({window})
          </span>
        )}
        {v.storagePaths.length > 0 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {v.storagePaths.join(", ")}
          </span>
        )}
      </div>

      {v.notes.length > 0 && (
        <div className="text-sm">
          <button
            type="button"
            className="text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowNotes((s) => !s)}
            aria-expanded={showNotes}
          >
            {v.notes.length === 1
              ? "Tasting note"
              : `${v.notes.length} tasting notes`}{" "}
            · {v.notes[0].score}/10
          </button>
          {showNotes && (
            <ul className="mt-1 space-y-2 border-l-2 pl-3">
              {v.notes.map((n, i) => (
                <li key={i}>
                  <span className="text-xs text-muted-foreground">
                    {n.date.slice(0, 10)} · {n.score}/10
                  </span>
                  {n.notes && <p className="whitespace-pre-line">{n.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-sm text-muted-foreground">
          {v.available} available
          {takenText && ` · ${takenText}`}
        </span>
        {joined && (
          <div className="flex items-center gap-1">
            {marked > 0 && (
              <Button
                variant="outline"
                size="icon"
                aria-label="Unmark one"
                disabled={busy}
                onClick={onUnmark}
              >
                <Minus />
              </Button>
            )}
            <Button
              variant={marked > 0 ? "outline" : "default"}
              size={marked > 0 ? "icon" : "default"}
              aria-label={marked > 0 ? "Mark another" : "Mark"}
              disabled={busy || v.available === 0 || capReached}
              onClick={onMark}
            >
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : marked > 0 ? (
                <Plus />
              ) : (
                "Mark"
              )}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
