"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Eye,
  EyeOff,
  FileDown,
  MonitorPlay,
  PenLine,
  Plus,
  ShoppingCart,
  Trash2,
  Wine,
} from "lucide-react";
import { PARTY_MAX_BOTTLES } from "@cellarboss/validators";
import type { PartyDetail } from "@cellarboss/types";
import type { ApiResult } from "@cellarboss/common";
import { useApiQuery } from "@/hooks/use-api-query";
import { queryGate } from "@/lib/functions/query-gate";
import {
  addGuestBottle,
  cancelParty,
  finishParty,
  getParty,
  removePartyBottle,
  pourPartyBottle,
  revealPartyBottle,
  setPartyWantToBuy,
  startHostRating,
} from "@/lib/api/parties";
import { Checkbox } from "@/components/ui/checkbox";
import { GuestBottlePicker } from "@/components/party/GuestBottlePicker";
import { PageHeader } from "@/components/page/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JoinCode } from "@/components/party/JoinCode";
import { ConfirmButton } from "@/components/party/ConfirmButton";
import { PartyWineCard } from "@/components/party/PartyWineCard";
import { formatPartyScore } from "@/components/party/ScoreInput";
import { bottleStats } from "@/components/party/partyStats";

export default function PartyConsolePage() {
  const { id } = useParams<{ id: string }>();
  const partyId = Number(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Hidden by default so the host can taste blind too; whoever bags and
  // pours the bottles opens the pour list to see which bottle is which label.
  const [showPourList, setShowPourList] = useState(false);
  const [addingGuestBottle, setAddingGuestBottle] = useState(false);
  const [pdfScores, setPdfScores] = useState(true);

  const partyQuery = useApiQuery({
    queryKey: ["party", partyId],
    queryFn: () => getParty(partyId),
    refetchInterval: (q) => (q.state.data?.status === "active" ? 3000 : false),
  });

  const result = queryGate([partyQuery]);
  if (!result.ready) return result.gate;
  const [party] = result.data;
  const active = party.status === "active";

  const run = async (action: () => Promise<ApiResult<PartyDetail>>) => {
    setError(null);
    const res = await action();
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    queryClient.setQueryData(["party", partyId], res.data);
    await queryClient.invalidateQueries({ queryKey: ["parties"] });
    await queryClient.invalidateQueries({ queryKey: ["bottles"] });
  };

  const guestName = new Map(party.guests.map((g) => [g.id, g.name]));
  const unrevealed = party.bottles.filter((b) => !b.revealedAt).length;
  const unpoured = party.bottles.filter((b) => !b.pouredAt);
  const nextToPour = [...unpoured].sort((a, b) => a.position - b.position)[0];
  const cellarCount = party.bottles.filter((b) => b.bottleId !== null).length;
  const guestCount = party.bottles.length - cellarCount;

  return (
    <section className="space-y-6">
      <PageHeader
        title={party.title}
        actions={
          <Badge variant={active ? "default" : "secondary"}>
            {party.status}
          </Badge>
        }
      />
      <p className="-mt-3 text-sm text-muted-foreground">
        {party.date} · {party.scoreScale === 5 ? "5 stars" : "100 points"} ·{" "}
        {party.guests.length} tasters · {party.reviews.length} reviews
      </p>

      {active && (
        <div className="flex flex-col gap-6 rounded-lg border p-4 md:flex-row md:items-center">
          <JoinCode token={party.token} />
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground max-w-md">
              Guests scan this to join. Labels are shuffled, so A–
              {party.bottles.at(-1)?.label} doesn&apos;t follow the order you
              picked them in. To taste blind yourself, have someone else open
              the pour list and bag the bottles.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/parties/${party.id}/present`} target="_blank">
                  <MonitorPlay /> Main screen
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const res = await startHostRating(party.id);
                  if (!res.ok) return setError(res.error.message);
                  router.push(`/party/${encodeURIComponent(res.data.token)}`);
                }}
              >
                <PenLine /> Rate blind as host
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowPourList((v) => !v)}
              >
                {showPourList ? <EyeOff /> : <Eye />}
                {showPourList ? "Hide pour list" : "Show pour list"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {active && party.pacing === "sequential" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div>
            <div className="font-medium">One at a time</div>
            <div className="text-sm text-muted-foreground">
              {party.bottles.length - unpoured.length} of {party.bottles.length}{" "}
              poured. Guests only see bottles you&apos;ve poured.
            </div>
          </div>
          {nextToPour && (
            <Button
              onClick={() =>
                run(() => pourPartyBottle(party.id, nextToPour.id))
              }
            >
              <Wine /> Pour next: {nextToPour.label}
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        {party.bottles.map((bottle) => {
          const stats = bottleStats(party, bottle.id);
          const reviews = party.reviews.filter(
            (r) => r.partyBottleId === bottle.id,
          );
          return (
            <div
              key={bottle.id}
              className={`rounded-lg border p-4 ${bottle.pouredAt ? "" : "border-dashed bg-muted/40"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-4">
                  <span className="flex flex-col items-center gap-1">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-xl font-bold text-primary-foreground">
                      {bottle.label}
                    </span>
                    {!bottle.pouredAt && (
                      <span className="text-[11px] text-muted-foreground">
                        not poured
                      </span>
                    )}
                  </span>
                  {bottle.revealedAt || !active || showPourList ? (
                    <div>
                      <PartyWineCard wine={bottle.wine} />
                      {bottle.broughtBy && (
                        <div className="mt-1 text-sm">
                          <Badge variant="secondary">
                            Guest bottle · {bottle.broughtBy}
                          </Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <div className="font-medium">Hidden</div>
                      <div className="text-sm">
                        Open the pour list to see it
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {stats.count} {stats.count === 1 ? "score" : "scores"}
                    {stats.mean !== null &&
                      ` · avg ${formatPartyScore(Math.round(stats.mean), party.scoreScale, party.formatDef)}`}
                  </span>
                  {(bottle.revealedAt || !active) && (
                    <Button
                      size="sm"
                      variant={bottle.wantToBuy ? "default" : "outline"}
                      aria-pressed={bottle.wantToBuy}
                      onClick={() =>
                        run(() =>
                          setPartyWantToBuy(
                            party.id,
                            bottle.id,
                            !bottle.wantToBuy,
                          ),
                        )
                      }
                    >
                      <ShoppingCart />
                      {bottle.wantToBuy ? "On buy list" : "Want to buy"}
                    </Button>
                  )}
                  {active && reviews.length === 0 && !bottle.revealedAt && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove bottle ${bottle.label}`}
                      title={
                        bottle.bottleId === null
                          ? "Remove this guest bottle"
                          : "Put this bottle back in its bin"
                      }
                      onClick={() =>
                        run(() => removePartyBottle(party.id, bottle.id))
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                  {active && !bottle.pouredAt ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        run(() => pourPartyBottle(party.id, bottle.id))
                      }
                    >
                      <Wine /> Pour {bottle.label}
                    </Button>
                  ) : bottle.revealedAt ? (
                    <Badge variant="outline">
                      <Eye /> Revealed
                    </Badge>
                  ) : (
                    active && (
                      <Button
                        size="sm"
                        onClick={() =>
                          run(() => revealPartyBottle(party.id, bottle.id))
                        }
                      >
                        Reveal {bottle.label}
                      </Button>
                    )
                  )}
                </div>
              </div>
              {reviews.length > 0 && (
                <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {reviews.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {guestName.get(r.guestId)}
                        {r.tags.length > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {r.tags.slice(0, 3).join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums">
                        {formatPartyScore(
                          r.score,
                          party.scoreScale,
                          party.formatDef,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {active && party.bottles.length < PARTY_MAX_BOTTLES && (
        <div className="space-y-2">
          {addingGuestBottle ? (
            <GuestBottlePicker
              onAdd={async (input) => {
                const res = await addGuestBottle(party.id, input);
                if (!res.ok) return res.error.message;
                queryClient.setQueryData(["party", partyId], res.data);
                setAddingGuestBottle(false);
                return null;
              }}
            />
          ) : (
            <Button
              variant="outline"
              onClick={() => setAddingGuestBottle(true)}
            >
              <Plus /> Someone brought a bottle
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <div className="flex-1 min-w-48">
          <div className="font-medium">Wine list for attendees</div>
          <div className="text-sm text-muted-foreground">
            A PDF of every wine with who brought it, the group&apos;s scores and
            the aromas people picked. Personal notes stay private.
            {active &&
              unrevealed > 0 &&
              ` It names all ${party.bottles.length} wines, including the ${unrevealed} not revealed yet.`}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={pdfScores}
            onCheckedChange={(v) => setPdfScores(v === true)}
          />
          Include each taster&apos;s score
        </label>
        <Button asChild variant="outline">
          <a href={`/parties/${party.id}/pdf?scores=${pdfScores ? 1 : 0}`}>
            <FileDown /> Download PDF
          </a>
        </Button>
      </div>

      {active && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <ConfirmButton
            label="Finish party"
            title="Finish the tasting?"
            description={`${cellarCount ? `Your ${cellarCount} cellar bottle(s) will be marked drunk on ${party.date}. ` : ""}${guestCount ? `${guestCount} guest bottle(s) will be recorded as drunk, with who brought them. ` : ""}Your blind ratings will be saved as tasting notes, and the guest link stops working.${unrevealed ? ` ${unrevealed} bottle(s) haven't been revealed yet.` : ""}${unpoured.length ? ` ${unpoured.length} bottle(s) were never poured: yours go back to their bins and unopened guest bottles are removed.` : ""}`}
            confirmLabel="Finish"
            onConfirm={() => run(() => finishParty(party.id))}
          />
          <ConfirmButton
            label="Cancel party"
            variant="outline"
            title="Cancel the tasting?"
            description={`${cellarCount ? "Your bottles go back to their bins as stored. " : ""}${guestCount ? "Guest bottles, and any wines this party added to your wine list, are removed. " : ""}Cancelled parties don't count toward your palate.`}
            confirmLabel="Cancel party"
            onConfirm={() => run(() => cancelParty(party.id))}
          />
        </div>
      )}
    </section>
  );
}
