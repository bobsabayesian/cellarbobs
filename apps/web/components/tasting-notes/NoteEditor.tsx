"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type {
  PartyAnswers,
  TastingFormat,
  TastingNote,
  TastingNoteFormat,
} from "@cellarboss/types";
import type { AnyFieldApi } from "@tanstack/react-form";
import { useApiQuery } from "@/hooks/use-api-query";
import { queryGate } from "@/lib/functions/query-gate";
import {
  createTastingNote,
  getTastingFormats,
  updateTastingNote,
} from "@/lib/api/tastingNotes";
import {
  FormatTasting,
  type FormatDraft,
} from "@/components/party/FormatTasting";
import { ScoreInput } from "@/components/party/ScoreInput";
import { WineVintageSelector } from "@/components/selector/WineVintageSelector";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STYLE_KEY = "cellarboss.noteStyle";

const STYLES: { id: TastingNoteFormat; label: string; hint: string }[] = [
  { id: "quick", label: "Quick", hint: "A score and a few words" },
  { id: "beginner", label: "Beginner", hint: "One screen of simple questions" },
  { id: "advanced", label: "Advanced", hint: "Look, nose, palate and verdict" },
];

function rememberedStyle(): TastingNoteFormat {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    if (saved === "beginner" || saved === "advanced") return saved;
  } catch {
    // Storage can be unavailable; quick is the default.
  }
  return "quick";
}

type NoteEditorProps = {
  /** Editing an existing note, in the style it was written in. */
  note?: TastingNote;
  /** The vintage to taste; when null the person picks one. */
  vintageId?: number | null;
  /** Where to go after saving (a path on this site). */
  returnTo?: string;
};

/** A path on this site, or null: never follow a link to another host. */
function safePath(path: string | undefined): string | null {
  return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
}

/**
 * An existing note's score in tens. A reaction-rated format (beginner) offers
 * a few fixed scores, so show the nearest reaction as the picked one.
 */
function startingScore(note: TastingNote, formats: TastingFormat[]): number {
  const tens = note.score * 10;
  const rating = formats.find((f) => f.id === note.format)?.rating;
  if (rating?.kind !== "reaction") return tens;
  return rating.options.reduce((best, o) =>
    Math.abs(o.score - tens) < Math.abs(best.score - tens) ? o : best,
  ).score;
}

/**
 * Writes a tasting note: pick a style (quick, or one of the party tasting
 * formats), then rate it. The style is remembered for next time.
 */
export function NoteEditor(props: NoteEditorProps) {
  const formatsQuery = useApiQuery({
    queryKey: ["tastingFormats"],
    queryFn: getTastingFormats,
    staleTime: Infinity,
  });
  const result = queryGate([formatsQuery]);
  if (!result.ready) return result.gate;
  return <Editor {...props} formats={result.data[0]} />;
}

function Editor({
  note,
  vintageId: initialVintageId,
  returnTo,
  formats,
}: NoteEditorProps & {
  formats: TastingFormat[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const editing = !!note;
  const [style, setStyle] = useState<TastingNoteFormat>(
    note ? (note.format ?? "quick") : rememberedStyle(),
  );
  const [vintageId, setVintageId] = useState(
    String(note?.vintageId ?? initialVintageId ?? 0),
  );
  // Scores are 0-10; the shared format UI works in tens (like 0-100 scores).
  const [draft, setDraft] = useState<FormatDraft>({
    answers: note?.answers ?? {},
    score: note ? startingScore(note, formats) : null,
    notes: note?.notes ?? "",
    guesses: {},
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const format = formats.find((f) => f.id === style) ?? null;
  const vintageChosen = Number(vintageId) > 0;

  const pickStyle = (id: TastingNoteFormat) => {
    setStyle(id);
    // Answers belong to one format's questions.
    setDraft((d) => ({ ...d, answers: {} }));
    try {
      localStorage.setItem(STYLE_KEY, id);
    } catch {
      // Not remembered; harmless.
    }
  };

  const save = async () => {
    setError(null);
    if (!vintageChosen) return setError("Choose the wine you tasted");
    if (draft.score === null) return setError("Give it a score");
    setSaving(true);
    const score = Math.round(draft.score / 10);
    const answers: PartyAnswers = style === "quick" ? {} : draft.answers;
    const res = note
      ? await updateTastingNote(note.id, {
          score,
          notes: draft.notes.trim(),
          answers,
        })
      : await createTastingNote({
          vintageId: Number(vintageId),
          score,
          notes: draft.notes.trim(),
          format: style,
          answers,
        });
    setSaving(false);
    if (!res.ok) return setError(res.error.message);
    for (const key of [
      "tastingNotes",
      "tastingNote",
      "wines",
      "wine",
      "vintages",
      "vintage",
    ])
      queryClient.invalidateQueries({ queryKey: [key] });
    router.push(safePath(returnTo) ?? `/vintages/${res.data.vintageId}`);
  };

  const vintageField = {
    name: "vintageId",
    state: { value: vintageId },
    handleChange: (v: string) => setVintageId(v),
  } as unknown as AnyFieldApi;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {!editing && (
        <div className="space-y-1.5">
          <Label>Wine</Label>
          <WineVintageSelector field={vintageField} editable />
        </div>
      )}

      {editing ? (
        <p className="text-sm text-muted-foreground">
          Written in the{" "}
          <strong>{STYLES.find((s) => s.id === style)?.label}</strong> style.
        </p>
      ) : (
        <div className="space-y-1.5">
          <Label id="note-style">Style</Label>
          <div
            role="radiogroup"
            aria-labelledby="note-style"
            className="grid grid-cols-3 gap-2"
          >
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={style === s.id}
                onClick={() => pickStyle(s.id)}
                className={cn(
                  "rounded-xl border px-2 py-2.5 text-center touch-manipulation",
                  style === s.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background",
                )}
              >
                <span className="block font-medium">{s.label}</span>
                <span
                  className={cn(
                    "block text-xs",
                    style === s.id
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {s.hint}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {style === "quick" || !format ? (
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border bg-card p-3.5">
            <h3 className="text-[17px] font-semibold">Score</h3>
            <ScoreInput
              value={draft.score}
              scale={10}
              onChange={(score) => setDraft((d) => ({ ...d, score }))}
            />
          </section>
          <section className="space-y-2 rounded-xl border bg-card p-3.5">
            <label htmlFor="quick-notes" className="text-[17px] font-semibold">
              Notes
            </label>
            <Textarea
              id="quick-notes"
              rows={5}
              value={draft.notes}
              placeholder="What did you think?"
              onChange={(e) =>
                setDraft((d) => ({ ...d, notes: e.target.value }))
              }
              className="text-base"
            />
          </section>
        </div>
      ) : (
        <FormatTasting
          // Restart at the first step when the style changes.
          key={format.id}
          format={format}
          scoreScale={10}
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          nextBottleLabel={null}
          onNextBottle={() => {}}
          revealed
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="lg" onClick={save} disabled={saving} className="flex-1">
          {editing ? "Save changes" : "Save note"}
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
