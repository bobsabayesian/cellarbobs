"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Check, Eye, FileDown, Loader2, Settings2, Wine } from "lucide-react";
import type {
  MyPartyReviews,
  PartyAnswers,
  PublicParty,
  TastingFormat,
} from "@cellarboss/types";
import type { PartyReview, UpsertPartyReview } from "@cellarboss/types";
import { useApiQuery } from "@/hooks/use-api-query";
import {
  getMyPartyReviews,
  getPublicParty,
  joinParty,
  savePartyReview,
} from "@/lib/api/party-public";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScoreInput, formatPartyScore } from "@/components/party/ScoreInput";
import { TagPicker } from "@/components/party/TagPicker";
import { StructureInput } from "@/components/party/StructureInput";
import { PartyWineCard } from "@/components/party/PartyWineCard";
import { FormatTasting } from "@/components/party/FormatTasting";
import { cn } from "@/lib/utils";

type Draft = Required<
  Pick<
    UpsertPartyReview,
    "tags" | "structure" | "notes" | "guesses" | "answers"
  >
> & { score: number | null };

const EMPTY: Draft = {
  score: null,
  tags: [],
  structure: {},
  notes: "",
  guesses: {},
  answers: {},
};

function toDraft(review: PartyReview): Draft {
  return {
    score: review.score,
    tags: review.tags,
    structure: review.structure,
    notes: review.notes,
    guesses: review.guesses,
    answers: review.answers ?? {},
  };
}

/**
 * What to save for a draft: format parties answer their questions (the
 * server derives tags and structure); older parties send tags and structure.
 */
function payloadFor(draft: Draft, hasFormat: boolean): UpsertPartyReview {
  const { score, notes, guesses } = draft;
  return hasFormat
    ? { score, notes, guesses, answers: draft.answers }
    : { score, notes, guesses, tags: draft.tags, structure: draft.structure };
}

export default function PartyGuestPage() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();

  const partyQuery = useApiQuery({
    queryKey: ["publicParty", token],
    queryFn: () => getPublicParty(token),
    refetchInterval: 3000,
    retry: false,
  });
  const meQuery = useApiQuery({
    queryKey: ["publicPartyMe", token],
    queryFn: () => getMyPartyReviews(token),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState<
    Record<string, "saving" | "saved" | "error">
  >({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const draftsRef = useRef<Record<string, Draft>>({});

  // Seed drafts once from the server, without clobbering later edits.
  useEffect(() => {
    if (!meQuery.data) return;
    const next = { ...draftsRef.current };
    for (const review of meQuery.data.reviews)
      next[review.label] ??= toDraft(review);
    draftsRef.current = next;
    setDrafts(next);
  }, [meQuery.data]);

  const party = partyQuery.data;
  const label = active ?? party?.bottles[0]?.label ?? null;

  // One at a time: when the host pours a new bottle, jump to it and say so.
  const seenLabels = useRef<Set<string> | null>(null);
  const [justPoured, setJustPoured] = useState<string | null>(null);
  // null until the party loads; "" means loaded with nothing poured yet.
  const pouredLabels = party
    ? party.bottles.map((b) => b.label).join(",")
    : null;
  useEffect(() => {
    if (pouredLabels === null) return;
    const labels = pouredLabels ? pouredLabels.split(",") : [];
    if (seenLabels.current === null) {
      seenLabels.current = new Set(labels);
      return;
    }
    const fresh = labels.filter((l) => !seenLabels.current!.has(l));
    for (const l of fresh) seenLabels.current.add(l);
    if (fresh.length) {
      const newest = fresh[fresh.length - 1];
      setActive(newest);
      setJustPoured(newest);
      window.scrollTo({ top: 0, behavior: "smooth" });
      const t = setTimeout(() => setJustPoured(null), 5000);
      return () => clearTimeout(t);
    }
  }, [pouredLabels]);

  if (partyQuery.isPending)
    return (
      <Centered>
        <Loader2 className="animate-spin" />
      </Centered>
    );
  if (partyQuery.isError || !party) {
    return (
      <Centered>
        <Wine className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">This tasting has ended</p>
        <p className="text-muted-foreground text-sm">
          Or the link is wrong. Ask the host for the QR code.
        </p>
      </Centered>
    );
  }

  const joined = meQuery.isSuccess;
  if (party.status === "finished") {
    return (
      <FinishedView
        party={party}
        token={token}
        me={joined ? meQuery.data : null}
      />
    );
  }
  if (!joined) {
    return (
      <JoinForm
        title={party.title}
        loading={meQuery.isPending}
        onJoin={async (name) => {
          const result = await joinParty(token, name);
          if (!result.ok) return result.error.message;
          await queryClient.invalidateQueries({
            queryKey: ["publicPartyMe", token],
          });
          return null;
        }}
      />
    );
  }

  const hasFormat = party.format !== null;

  // Edits apply to the ref synchronously, so rapid taps never build on a
  // stale render, and each save sends the whole draft.
  const update = (bottleLabel: string, patch: Partial<Draft>) => {
    const next = { ...(draftsRef.current[bottleLabel] ?? EMPTY), ...patch };
    draftsRef.current = { ...draftsRef.current, [bottleLabel]: next };
    setDrafts(draftsRef.current);
    setSaving((s) => ({ ...s, [bottleLabel]: "saving" }));
    clearTimeout(timers.current[bottleLabel]);
    timers.current[bottleLabel] = setTimeout(async () => {
      const result = await savePartyReview(
        token,
        bottleLabel,
        payloadFor(draftsRef.current[bottleLabel], hasFormat),
      );
      setSaving((s) => ({
        ...s,
        [bottleLabel]: result.ok ? "saved" : "error",
      }));
    }, 500);
  };

  const bottle = party.bottles.find((b) => b.label === label);
  const draft = (label && drafts[label]) || EMPTY;

  return (
    <div className="mx-auto max-w-md pb-24">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold truncate">{party.title}</h1>
          <span className="text-sm text-muted-foreground shrink-0">
            {meQuery.data.name}
          </span>
        </div>
        <MyLinks token={token} me={meQuery.data} />
        <nav className="mt-3 flex gap-2 overflow-x-auto" aria-label="Bottles">
          {party.bottles.map((b) => {
            const done = drafts[b.label]?.score != null;
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => setActive(b.label)}
                aria-current={b.label === label}
                className={cn(
                  "relative h-12 min-w-12 rounded-lg border text-lg font-semibold touch-manipulation",
                  b.label === label
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background",
                )}
              >
                {b.label}
                {done && (
                  <Check className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-green-600 p-0.5 text-white" />
                )}
                {b.revealed && (
                  <Eye className="absolute -bottom-1.5 -right-1.5 h-4 w-4 rounded-full bg-amber-500 p-0.5 text-white" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {party.bottles.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
          <Wine className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium">Waiting for the first pour</p>
          <p className="text-sm text-muted-foreground">
            Bottles appear here as the host pours them. Keep this page open.
          </p>
        </div>
      )}
      {bottle && label && (
        <main className="space-y-6 px-4 pt-4">
          {justPoured && (
            <div
              role="status"
              className="rounded-lg border border-primary bg-primary px-4 py-3 text-center text-base font-medium text-primary-foreground"
            >
              Bottle {justPoured} is poured
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Bottle {label}</h2>
            <SaveState state={saving[label]} />
          </div>

          {bottle.revealed && bottle.wine && (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Revealed
              </div>
              <PartyWineCard wine={bottle.wine} broughtBy={bottle.broughtBy} />
              {bottle.scores && bottle.scores.length > 0 && (
                <ul className="text-sm space-y-0.5">
                  {bottle.scores.map((s, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{s.guest}</span>
                      <span className="tabular-nums">
                        {formatPartyScore(
                          s.score,
                          party.scoreScale,
                          party.format,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {party.format ? (
            <FormatTasting
              key={label}
              format={party.format}
              scoreScale={party.scoreScale}
              draft={draft}
              onChange={(patch) => update(label, patch)}
              revealed={bottle.revealed}
              nextBottleLabel={(() => {
                const labels = party.bottles.map((b) => b.label);
                const next = labels[labels.indexOf(label) + 1];
                return next ? `Next: Bottle ${next}` : null;
              })()}
              onNextBottle={() => {
                const labels = party.bottles.map((b) => b.label);
                const next = labels[labels.indexOf(label) + 1];
                if (next) setActive(next);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ) : (
            <>
              <Section title="Score">
                <ScoreInput
                  value={draft.score}
                  scale={party.scoreScale}
                  onChange={(score) => update(label, { score })}
                />
              </Section>

              <Section title="What do you get?">
                <TagPicker
                  groups={party.tagGroups}
                  value={draft.tags}
                  onChange={(tags) => update(label, { tags })}
                />
              </Section>

              <Section title="Structure">
                <StructureInput
                  value={draft.structure}
                  onChange={(structure) => update(label, { structure })}
                />
              </Section>

              <Section title="Notes">
                <Textarea
                  value={draft.notes}
                  rows={3}
                  placeholder="Anything else…"
                  onChange={(e) => update(label, { notes: e.target.value })}
                  className="text-base"
                />
              </Section>

              {!bottle.revealed && (
                <Section title="Your guess (optional)">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Grape"
                      value={draft.guesses.grape ?? ""}
                      onChange={(e) =>
                        update(label, {
                          guesses: {
                            ...draft.guesses,
                            grape: e.target.value || undefined,
                          },
                        })
                      }
                      className="text-base"
                    />
                    <Input
                      placeholder="Region"
                      value={draft.guesses.region ?? ""}
                      onChange={(e) =>
                        update(label, {
                          guesses: {
                            ...draft.guesses,
                            region: e.target.value || undefined,
                          },
                        })
                      }
                      className="text-base"
                    />
                    <Input
                      placeholder="Country"
                      value={draft.guesses.country ?? ""}
                      onChange={(e) =>
                        update(label, {
                          guesses: {
                            ...draft.guesses,
                            country: e.target.value || undefined,
                          },
                        })
                      }
                      className="text-base"
                    />
                    <Input
                      placeholder="Vintage"
                      inputMode="numeric"
                      value={draft.guesses.vintage ?? ""}
                      onChange={(e) => {
                        const year = Number(e.target.value);
                        update(label, {
                          guesses: {
                            ...draft.guesses,
                            vintage:
                              e.target.value.length === 4 &&
                              year >= 1800 &&
                              year <= 2100
                                ? year
                                : undefined,
                          },
                        });
                      }}
                      className="text-base"
                    />
                  </div>
                </Section>
              )}

              <NextBottle
                labels={party.bottles.map((b) => b.label)}
                current={label}
                onSelect={(l) => {
                  setActive(l);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </>
          )}
        </main>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function SaveState({ state }: { state?: "saving" | "saved" | "error" }) {
  if (!state) return null;
  return (
    <span
      className={cn(
        "text-sm",
        state === "error" ? "text-destructive" : "text-muted-foreground",
      )}
      aria-live="polite"
    >
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Saved"
          : "Not saved — retry"}
    </span>
  );
}

function NextBottle({
  labels,
  current,
  onSelect,
}: {
  labels: string[];
  current: string;
  onSelect: (label: string) => void;
}) {
  const next = labels[labels.indexOf(current) + 1];
  if (!next) return null;
  return (
    <Button
      size="lg"
      className="w-full h-12 text-base"
      onClick={() => onSelect(next)}
    >
      Next: Bottle {next}
    </Button>
  );
}

function JoinForm({
  title,
  loading,
  onJoin,
}: {
  title: string;
  loading: boolean;
  onJoin: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading)
    return (
      <Centered>
        <Loader2 className="animate-spin" />
      </Centered>
    );

  return (
    <Centered>
      <Wine className="h-12 w-12 text-primary" />
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">Blind tasting · no account needed</p>
      <form
        className="mt-4 w-full max-w-xs space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          setError(await onJoin(name.trim()));
          setBusy(false);
        }}
      >
        <Input
          autoFocus
          maxLength={40}
          placeholder="Your name or nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 text-base text-center"
        />
        <Button
          type="submit"
          size="lg"
          className="w-full h-12 text-base"
          disabled={busy || !name.trim()}
        >
          {busy ? <Loader2 className="animate-spin" /> : "Join the tasting"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </Centered>
  );
}

/** "My notes" download, and for the host a way back to the console. */
function MyLinks({ token, me }: { token: string; me: MyPartyReviews }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {me.isHost && me.partyId !== null && (
        <Button asChild size="sm" variant="secondary">
          <Link href={`/parties/${me.partyId}`}>
            <Settings2 /> Host console
          </Link>
        </Button>
      )}
      <Button asChild size="sm" variant="outline">
        <a href={`/party/${encodeURIComponent(token)}/notes`}>
          <FileDown /> My notes (PDF)
        </a>
      </Button>
    </div>
  );
}

/** After the party: every wine, everyone's scores, and your own notes. */
function FinishedView({
  party,
  token,
  me,
}: {
  party: PublicParty;
  token: string;
  me: MyPartyReviews | null;
}) {
  const mine = new Map((me?.reviews ?? []).map((r) => [r.label, r]));
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pt-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold">{party.title}</h1>
        <p className="text-muted-foreground">
          This tasting has ended. Here&apos;s what you tasted.
        </p>
        {me && <MyLinks token={token} me={me} />}
      </div>
      {party.bottles.map((b) => {
        const review = mine.get(b.label);
        return (
          <section key={b.label} className="space-y-2 rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl font-black">{b.label}</span>
              {b.wine && (
                <PartyWineCard wine={b.wine} broughtBy={b.broughtBy} />
              )}
            </div>
            {review && (
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <div className="font-medium">
                  You:{" "}
                  {formatPartyScore(
                    review.score,
                    party.scoreScale,
                    party.format,
                  )}
                </div>
                {review.tags.length > 0 && <div>{review.tags.join(", ")}</div>}
                {party.format &&
                  answerLines(party.format, review.answers).map((line) => (
                    <div key={line} className="text-muted-foreground">
                      {line}
                    </div>
                  ))}
                {review.notes && (
                  <div className="whitespace-pre-wrap">{review.notes}</div>
                )}
              </div>
            )}
            {b.scores && b.scores.length > 0 && (
              <ul className="text-sm space-y-0.5">
                {b.scores.map((s, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{s.guest}</span>
                    <span className="tabular-nums">
                      {formatPartyScore(
                        s.score,
                        party.scoreScale,
                        party.format,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** "Finish length: long" lines for a review's non-aroma answers. */
function answerLines(format: TastingFormat, answers: PartyAnswers): string[] {
  const lines: string[] = [];
  for (const step of format.steps)
    for (const block of step.blocks)
      for (const field of block.fields) {
        const value = answers[field.key];
        if (value === undefined || field.tag) continue;
        const text = Array.isArray(value) ? value.join(", ") : value;
        if (text) lines.push(`${field.label}: ${text}`);
      }
  return lines;
}
