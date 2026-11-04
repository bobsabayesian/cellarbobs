"use client";

import Link from "next/link";
import { PartyPopper, Plus } from "lucide-react";
import type { PalateGroup } from "@cellarboss/types";
import { useApiQuery } from "@/hooks/use-api-query";
import { queryGate } from "@/lib/functions/query-gate";
import { getPalate, getParties, getWantToBuy } from "@/lib/api/parties";
import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/page/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_VARIANT = {
  active: "default",
  finished: "secondary",
  cancelled: "outline",
} as const;

export default function PartiesPage() {
  const partiesQuery = useApiQuery({
    queryKey: ["parties"],
    queryFn: getParties,
  });
  const palateQuery = useApiQuery({ queryKey: ["palate"], queryFn: getPalate });
  const buyQuery = useApiQuery({
    queryKey: ["wantToBuy"],
    queryFn: getWantToBuy,
  });

  const result = queryGate([partiesQuery, palateQuery, buyQuery]);
  if (!result.ready) return result.gate;
  const [parties, palate, wantToBuy] = result.data;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Tasting Parties"
        actions={
          <Button asChild>
            <Link href="/parties/new">
              <Plus /> New party
            </Link>
          </Button>
        }
      />

      {parties.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <PartyPopper className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No tastings yet</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Pick a few bottles, share the QR code, and everyone rates them blind
            on their phone.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {parties.map((party) => (
            <li key={party.id}>
              <Link
                href={`/parties/${party.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{party.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {party.date} · {party.bottleCount} bottles ·{" "}
                    {party.guestCount} tasters · {party.reviewCount} reviews
                  </div>
                  {party.needsDetailsCount > 0 && (
                    <Badge variant="destructive" className="mt-1">
                      {party.needsDetailsCount} mystery{" "}
                      {party.needsDetailsCount === 1
                        ? "bottle needs"
                        : "bottles need"}{" "}
                      details
                    </Badge>
                  )}
                </div>
                <Badge variant={STATUS_VARIANT[party.status]}>
                  {party.status}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {wantToBuy.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> Want to buy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {wantToBuy.map((w) => (
                <li
                  key={`${w.partyId}-${w.label}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/vintages/${w.wine.vintageId}`}
                      className="font-medium hover:underline"
                    >
                      {w.wine.winemaker} {w.wine.wineName} {w.wine.year ?? "NV"}
                    </Link>
                    <div className="text-sm text-muted-foreground">
                      {w.broughtBy ? `Brought by ${w.broughtBy} · ` : ""}
                      <Link
                        href={`/parties/${w.partyId}`}
                        className="hover:underline"
                      >
                        {w.partyTitle}
                      </Link>{" "}
                      ({w.partyDate})
                    </div>
                  </div>
                  <span className="text-sm tabular-nums">
                    {w.hostScore !== null && `you ${w.hostScore} · `}
                    {w.averageScore !== null
                      ? `group ${w.averageScore} (${w.scoreCount})`
                      : "unscored"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {palate.profile.reviewCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your blind palate</CardTitle>
            <p className="text-sm text-muted-foreground">
              {palate.profile.reviewCount} blind ratings · average{" "}
              {palate.profile.overallMean}/100. Positive numbers mean you score
              that group above your average.
            </p>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <PalateList title="Grapes" groups={palate.profile.byGrape} />
            <PalateList title="Regions" groups={palate.profile.byRegion} />
            <PalateList title="Age at tasting" groups={palate.profile.byAge} />
            <PalateList title="Structure" groups={palate.profile.byStructure} />
            <PalateList title="Tags" groups={palate.profile.byTag} />
            {palate.calibration.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Tasters like you</h3>
                <ul className="text-sm space-y-1">
                  {palate.calibration.map((t) => (
                    <li key={t.taster} className="flex justify-between gap-2">
                      <span className="truncate">{t.taster}</span>
                      <span className="tabular-nums text-muted-foreground">
                        r {t.correlation ?? "–"} · {t.meanOffset > 0 ? "+" : ""}
                        {t.meanOffset}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function PalateList({
  title,
  groups,
}: {
  title: string;
  groups: PalateGroup[];
}) {
  if (groups.length === 0) return null;
  const shown =
    groups.length > 6 ? [...groups.slice(0, 3), ...groups.slice(-3)] : groups;
  return (
    <div>
      <h3 className="text-sm font-medium mb-2">{title}</h3>
      <ul className="text-sm space-y-1">
        {shown.map((g) => (
          <li key={g.key} className="flex justify-between gap-2">
            <span className="truncate">
              {g.key} <span className="text-muted-foreground">({g.count})</span>
            </span>
            <span
              className={
                g.delta > 0
                  ? "text-green-700 dark:text-green-400 tabular-nums"
                  : g.delta < 0
                    ? "text-red-700 dark:text-red-400 tabular-nums"
                    : "tabular-nums"
              }
            >
              {g.delta > 0 ? "+" : ""}
              {g.delta}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
