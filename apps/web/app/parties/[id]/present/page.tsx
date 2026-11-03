"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { getParty } from "@/lib/api/parties";
import { JoinCode } from "@/components/party/JoinCode";
import { PartyWineCard } from "@/components/party/PartyWineCard";
import { formatPartyScore } from "@/components/party/ScoreInput";
import { bottleStats } from "@/components/party/partyStats";

/**
 * The host's "main screen": put it on a TV or laptop. Shows the join QR and,
 * as the host reveals each bottle from the console, the wine and every score.
 */
export default function PartyPresentPage() {
  const { id } = useParams<{ id: string }>();
  const partyQuery = useApiQuery({
    queryKey: ["party", Number(id)],
    queryFn: () => getParty(Number(id)),
    refetchInterval: 3000,
  });

  const party = partyQuery.data;
  if (!party)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );

  const guestName = new Map(party.guests.map((g) => [g.id, g.name]));
  const anyRevealed = party.bottles.some((b) => b.revealedAt);
  // The room only sees what's been poured.
  const poured = party.bottles.filter((b) => b.pouredAt);
  const justPoured =
    party.pacing === "sequential"
      ? [...poured].sort((a, b) =>
          (b.pouredAt ?? "").localeCompare(a.pouredAt ?? ""),
        )[0]
      : undefined;

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="flex shrink-0 flex-col items-center gap-3 lg:w-96">
          <h1 className="text-center text-3xl font-bold">{party.title}</h1>
          {party.status === "active" ? (
            <>
              <JoinCode token={party.token} large />
              <p className="text-lg text-muted-foreground">
                Scan to join · rate blind
              </p>
              {justPoured && (
                <p className="text-3xl font-bold">
                  Just poured: {justPoured.label}
                </p>
              )}
            </>
          ) : (
            <p className="text-lg text-muted-foreground">
              This tasting is {party.status}.
            </p>
          )}
          <p className="text-muted-foreground">
            {party.guests.length} tasters ·{" "}
            {party.reviews.filter((r) => r.score !== null).length} scores
          </p>
        </aside>

        <main className="grid flex-1 content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {poured.length === 0 && (
            <p className="text-2xl text-muted-foreground">
              The first bottle is on its way…
            </p>
          )}
          {poured.map((bottle) => {
            const revealed = !!bottle.revealedAt || party.status === "finished";
            const stats = bottleStats(party, bottle.id);
            const reviews = party.reviews.filter(
              (r) => r.partyBottleId === bottle.id && r.score !== null,
            );
            return (
              <div
                key={bottle.id}
                className={
                  revealed
                    ? "rounded-xl border-2 border-amber-500 bg-card p-5"
                    : "rounded-xl border bg-card p-5"
                }
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-4xl font-black">{bottle.label}</span>
                  <span className="text-muted-foreground">
                    {stats.count} {stats.count === 1 ? "score" : "scores"}
                  </span>
                </div>
                {revealed ? (
                  <div className="mt-3 space-y-3">
                    <PartyWineCard
                      wine={bottle.wine}
                      broughtBy={bottle.broughtBy}
                    />
                    {stats.mean !== null && (
                      <div className="flex items-baseline gap-3">
                        <span className="text-4xl font-bold tabular-nums">
                          {formatPartyScore(
                            Math.round(stats.mean),
                            party.scoreScale,
                            party.formatDef,
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          avg · range{" "}
                          {formatPartyScore(
                            stats.min,
                            party.scoreScale,
                            party.formatDef,
                          )}
                          –
                          {formatPartyScore(
                            stats.max,
                            party.scoreScale,
                            party.formatDef,
                          )}
                        </span>
                      </div>
                    )}
                    <ul className="space-y-1 text-sm">
                      {reviews.map((r) => {
                        const guess = [
                          r.guesses.grape,
                          r.guesses.region,
                          r.guesses.vintage,
                        ]
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <li key={r.id} className="flex justify-between gap-2">
                            <span className="truncate">
                              {guestName.get(r.guestId)}
                              {guess && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  guessed {guess}
                                </span>
                              )}
                            </span>
                            <span className="tabular-nums font-medium">
                              {formatPartyScore(
                                r.score,
                                party.scoreScale,
                                party.formatDef,
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-6 text-center text-muted-foreground">
                    {anyRevealed ? "Not revealed yet" : "Tasting…"}
                  </p>
                )}
              </div>
            );
          })}
        </main>
      </div>
    </div>
  );
}
