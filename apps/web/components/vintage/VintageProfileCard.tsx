"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Globe, Loader2, RefreshCw } from "lucide-react";
import type {
  Vintage,
  VintageEnrichment,
  WineProfileData,
} from "@cellarboss/types";
import { formatDate } from "@cellarboss/common";
import { useApiQuery } from "@/hooks/use-api-query";
import { getVintageEnrichment, lookupVintage } from "@/lib/api/enrich";
import { updateVintage } from "@/lib/api/vintages";
import { authClient } from "@/lib/auth-client";
import { useSettingsContext } from "@/contexts/settings-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = { vintage: Vintage; className?: string };

/**
 * Wine data looked up online: critic scores, reviews, technical details.
 * An admin can look the vintage up (again); anyone can use a suggested
 * drinking window when the vintage has none.
 */
export function VintageProfileCard({ vintage, className = "" }: Props) {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const isAdmin = session.data?.user?.role === "admin";
  const dateFormat = useSettingsContext().get("date") as string | undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ["enrichment", vintage.id];
  const query = useApiQuery<VintageEnrichment>({
    queryKey,
    queryFn: () => getVintageEnrichment(vintage.id),
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["vintage", vintage.id] }),
      queryClient.invalidateQueries({ queryKey: ["vintages"] }),
    ]);
  }

  async function lookUp() {
    setBusy(true);
    setError(null);
    const result = await lookupVintage(vintage.id);
    if (!result.ok) setError(result.error.message);
    await refresh();
    setBusy(false);
  }

  async function applyWindow(drinkFrom: number, drinkUntil: number) {
    setError(null);
    const result = await updateVintage({ ...vintage, drinkFrom, drinkUntil });
    if (!result.ok) setError(result.error.message);
    await refresh();
  }

  const data = query.data;
  const profile = data?.profile;
  const p = profile?.status === "ok" ? profile.profile : null;
  const hasWindow = vintage.drinkFrom !== null || vintage.drinkUntil !== null;
  const lookedUpWindow =
    p?.serving?.drinkFrom && p.serving.drinkUntil
      ? { from: p.serving.drinkFrom, until: p.serving.drinkUntil }
      : null;

  return (
    <div className={className}>
      <h2 className="text-sm font-semibold text-muted-foreground mb-2">
        Online data
      </h2>
      <Card>
        <CardContent className="space-y-4">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !profile ? (
            <p className="text-sm text-muted-foreground">Not looked up yet.</p>
          ) : profile.status === "not_found" ? (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t find this wine online.
            </p>
          ) : profile.status === "error" ? (
            <p className="text-sm text-destructive">
              The last lookup failed: {profile.error}
            </p>
          ) : null}

          {data && data.scores.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.scores.map((s) => {
                const badge = (
                  <Badge variant="secondary" className="text-sm">
                    <span className="font-semibold">{s.score}</span> {s.critic}
                  </Badge>
                );
                return s.sourceUrl ? (
                  <a
                    key={s.id}
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {badge}
                  </a>
                ) : (
                  <span key={s.id}>{badge}</span>
                );
              })}
            </div>
          )}

          {!hasWindow && (lookedUpWindow || data?.windowEstimate) && (
            <div className="rounded-md border border-border p-3 space-y-2 text-sm">
              <p className="font-medium">No drinking window yet</p>
              {lookedUpWindow && (
                <WindowOffer
                  label={`Online: ${lookedUpWindow.from}–${lookedUpWindow.until}`}
                  onUse={() =>
                    applyWindow(lookedUpWindow.from, lookedUpWindow.until)
                  }
                />
              )}
              {data?.windowEstimate && (
                <WindowOffer
                  label={`From ${data.windowEstimate.basedOn} other ${
                    data.windowEstimate.basedOn === 1 ? "vintage" : "vintages"
                  }: ${data.windowEstimate.drinkFrom}–${data.windowEstimate.drinkUntil}`}
                  onUse={() =>
                    applyWindow(
                      data.windowEstimate!.drinkFrom,
                      data.windowEstimate!.drinkUntil,
                    )
                  }
                />
              )}
            </div>
          )}

          {p && <ProfileDetails profile={p} />}

          {profile && profile.sources.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {profile.sources.length}{" "}
                {profile.sources.length === 1 ? "source" : "sources"}
              </summary>
              <ul className="mt-2 space-y-1">
                {profile.sources.map((s) => (
                  <li key={s.uri}>
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline break-all"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {s.title ?? s.uri}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {profile && (
            <p className="text-xs text-muted-foreground">
              Looked up{" "}
              {formatDate(profile.fetchedAt, dateFormat ?? "dd/MM/yyyy")} with{" "}
              {profile.model}
              {p?.confidence && ` · ${p.confidence} confidence`}. AI-gathered:
              check the sources before relying on it.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={lookUp}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : profile ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Globe className="h-4 w-4" />
              )}
              {busy
                ? "Looking up… this can take a minute"
                : profile
                  ? "Look up again"
                  : "Look up online"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WindowOffer({ label, onUse }: { label: string; onUse: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <Button variant="outline" size="sm" onClick={onUse}>
        Use
      </Button>
    </div>
  );
}

type Row = [label: string, value: string | null | undefined];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  if (shown.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {shown.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const list = (values: string[] | null | undefined) =>
  values && values.length > 0 ? values.join(", ") : null;

function ProfileDetails({ profile: p }: { profile: WineProfileData }) {
  const grapes = p.composition?.grapes
    ?.map((g) => (g.percentage ? `${g.variety} ${g.percentage}%` : g.variety))
    .join(", ");
  const price = p.market?.averagePriceUsd;
  return (
    <div className="space-y-4">
      <Section
        title="Wine"
        rows={[
          ["Style", p.wine?.style],
          ["Classification", p.wine?.classification],
          ["Appellation", p.origin?.appellation],
          ["Subregion", p.origin?.subregion],
          ["Commune", p.origin?.commune],
          ["Vineyards", list(p.origin?.vineyards)],
          ["Grapes", grapes],
          ["Alcohol", p.composition?.alcohol],
          ["Allergens", list(p.composition?.allergens)],
        ]}
      />
      <Section
        title="Tasting"
        rows={[
          ["Appearance", p.tasting?.appearance],
          ["Aromas", list(p.tasting?.aromas)],
          ["Body", p.tasting?.body],
          ["Tannins", p.tasting?.tannins],
          ["Acidity", p.tasting?.acidity],
          ["Finish", p.tasting?.finish],
        ]}
      />
      {p.reviews && p.reviews.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1">Reviews</h3>
          <ul className="space-y-1 text-sm">
            {p.reviews.map((r, i) => (
              <li key={i}>
                <span className="font-medium">{r.source}:</span> {r.summary}{" "}
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                    aria-label={`Read the ${r.source} review`}
                  >
                    <ExternalLink className="inline h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Section
        title="Serving"
        rows={[
          [
            "Drinking window",
            p.serving?.drinkFrom && p.serving.drinkUntil
              ? `${p.serving.drinkFrom}–${p.serving.drinkUntil}`
              : null,
          ],
          ["Temperature", p.serving?.temperature],
          ["Decanting", p.serving?.decanting],
          ["Food", list(p.serving?.foodPairings)],
        ]}
      />
      <Section
        title="Winemaking"
        rows={[
          ["Vine density", p.winemaking?.vineDensity],
          ["Yield", p.winemaking?.yield],
          ["Harvest", p.winemaking?.harvest],
          ["Fermentation", p.winemaking?.fermentation],
          ["Oak", p.winemaking?.oakAging],
          ["Other ageing", p.winemaking?.otherAging],
          ["Filtration", p.winemaking?.filtration],
          ["Sulfites", p.winemaking?.sulfites],
        ]}
      />
      <Section
        title="Market"
        rows={[
          ["Average price", price ? `$${price}` : null],
          ["Barcodes", list(p.market?.barcodes)],
        ]}
      />
    </div>
  );
}
