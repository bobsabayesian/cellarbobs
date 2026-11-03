"use client";

import { useState } from "react";
import type {
  PartyAnswers,
  PartyGuesses,
  TastingFormat,
  TastingFormatField,
} from "@cellarboss/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScoreInput } from "@/components/party/ScoreInput";
import { cn } from "@/lib/utils";

export type FormatDraft = {
  answers: PartyAnswers;
  score: number | null;
  notes: string;
  guesses: PartyGuesses;
};

type FormatTastingProps = {
  format: TastingFormat;
  scoreScale: 100 | 5;
  draft: FormatDraft;
  onChange: (patch: Partial<FormatDraft>) => void;
  /** Shown on the last step's button, e.g. "Next: Bottle B". */
  nextBottleLabel: string | null;
  onNextBottle: () => void;
  /** Guessing is hidden once the bottle is revealed. */
  revealed: boolean;
};

/**
 * One bottle's tasting, driven by a format file: steps (Look, Nose, ...) of
 * blocks of fields, then the rating, notes and guess on the last step.
 * Beginner has a single step, so no step tabs are shown.
 */
export function FormatTasting({
  format,
  scoreScale,
  draft,
  onChange,
  nextBottleLabel,
  onNextBottle,
  revealed,
}: FormatTastingProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const steps = format.steps;
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const last = stepIndex >= steps.length - 1;

  const setAnswer = (key: string, value: string | string[] | undefined) => {
    const answers = { ...draft.answers };
    if (value === undefined || (Array.isArray(value) && value.length === 0))
      delete answers[key];
    else answers[key] = value;
    onChange({ answers });
  };

  const goTo = (i: number) => {
    setStepIndex(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      {steps.length > 1 && (
        <div
          role="tablist"
          aria-label="Tasting steps"
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          }}
        >
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === stepIndex}
              onClick={() => goTo(i)}
              className="min-h-11 pt-1.5 text-left touch-manipulation"
            >
              <span
                className={cn(
                  "block h-1 rounded-full",
                  i <= stepIndex ? "bg-primary" : "bg-border",
                )}
              />
              <span
                className={cn(
                  "mt-1.5 block text-[13px]",
                  i === stepIndex
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {s.title}
              </span>
            </button>
          ))}
        </div>
      )}

      {step.hint && (
        <p className="text-[15px] leading-snug text-muted-foreground">
          {step.hint}
        </p>
      )}

      {step.blocks.map((block) => {
        const isOpen = block.collapsible
          ? (open[block.id] ?? block.open ?? false)
          : true;
        const count = block.fields.reduce((n, f) => {
          const v = draft.answers[f.key];
          return n + (Array.isArray(v) ? v.length : v ? 1 : 0);
        }, 0);
        return (
          <section
            key={block.id}
            className="space-y-4 rounded-xl border bg-card p-3.5"
          >
            {block.collapsible ? (
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [block.id]: !isOpen }))}
                className="flex min-h-11 w-full items-center justify-between gap-3 text-left touch-manipulation"
              >
                <span>
                  <span className="block text-[17px] font-semibold">
                    {block.title}
                  </span>
                  {block.subtitle && (
                    <span className="block text-[13px] text-muted-foreground">
                      {block.subtitle}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap text-[13px] text-muted-foreground">
                  {count > 0 && `${count} picked`}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={cn(
                      "transition-transform",
                      isOpen && "rotate-180",
                    )}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
            ) : (
              <div>
                <h3 className="text-[17px] font-semibold">{block.title}</h3>
                {block.subtitle && (
                  <p className="text-[13px] text-muted-foreground">
                    {block.subtitle}
                  </p>
                )}
              </div>
            )}
            {isOpen &&
              block.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={draft.answers[field.key]}
                  onChange={(v) => setAnswer(field.key, v)}
                />
              ))}
          </section>
        );
      })}

      {last && (
        <>
          <section className="space-y-3 rounded-xl border bg-card p-3.5">
            <h3 className="text-[17px] font-semibold">
              {format.rating.kind === "reaction"
                ? "How did you like it?"
                : "Score"}
            </h3>
            {format.rating.kind === "reaction" ? (
              <div className="grid gap-2">
                {format.rating.options.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={draft.score === o.score}
                    onClick={() =>
                      onChange({
                        score: draft.score === o.score ? null : o.score,
                      })
                    }
                    className={cn(
                      "min-h-12 rounded-xl border text-[17px] font-medium capitalize touch-manipulation",
                      draft.score === o.score
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <ScoreInput
                value={draft.score}
                scale={scoreScale}
                onChange={(score) => onChange({ score })}
              />
            )}
          </section>

          <section className="space-y-2 rounded-xl border bg-card p-3.5">
            <label
              htmlFor="tasting-notes"
              className="text-[17px] font-semibold"
            >
              Notes
            </label>
            <Textarea
              id="tasting-notes"
              rows={3}
              value={draft.notes}
              placeholder="Anything else…"
              onChange={(e) => onChange({ notes: e.target.value })}
              className="text-base"
            />
          </section>

          {!revealed && (
            <section className="space-y-2.5 rounded-xl border bg-card p-3.5">
              <h3 className="text-[17px] font-semibold">
                Your guess{" "}
                <span className="text-[13px] font-normal text-muted-foreground">
                  optional
                </span>
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                {(
                  [
                    ["grape", "Grape"],
                    ["region", "Region"],
                    ["country", "Country"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="space-y-1 text-[13px] text-muted-foreground"
                  >
                    {label}
                    <Input
                      value={draft.guesses[key] ?? ""}
                      onChange={(e) =>
                        onChange({
                          guesses: {
                            ...draft.guesses,
                            [key]: e.target.value || undefined,
                          },
                        })
                      }
                      className="h-11 text-base text-foreground"
                    />
                  </label>
                ))}
                <label className="space-y-1 text-[13px] text-muted-foreground">
                  Vintage
                  <Input
                    inputMode="numeric"
                    maxLength={4}
                    defaultValue={draft.guesses.vintage ?? ""}
                    onChange={(e) => {
                      const year = Number(e.target.value);
                      onChange({
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
                    className="h-11 text-base text-foreground"
                  />
                </label>
              </div>
            </section>
          )}
        </>
      )}

      {!last ? (
        <Button
          size="lg"
          className="h-13 w-full text-[17px]"
          onClick={() => goTo(stepIndex + 1)}
        >
          Next: {steps[stepIndex + 1].title}
        </Button>
      ) : (
        nextBottleLabel && (
          <Button
            size="lg"
            className="h-13 w-full text-[17px]"
            onClick={() => {
              setStepIndex(0);
              onNextBottle();
            }}
          >
            {nextBottleLabel}
          </Button>
        )
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: TastingFormatField;
  value: string | string[] | undefined;
  onChange: (value: string | string[] | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-foreground/80">
          {field.label}
        </span>
        {field.note && (
          <span className="text-xs text-muted-foreground">{field.note}</span>
        )}
      </div>
      {field.kind === "scale" && (
        <ScaleField
          field={field}
          value={value as string | undefined}
          onChange={onChange}
        />
      )}
      {field.kind === "multi" && (
        <MultiField
          field={field}
          value={(value as string[] | undefined) ?? []}
          onChange={onChange}
        />
      )}
      {field.kind === "colour" && (
        <ColourField
          field={field}
          value={value as string | undefined}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function ScaleField({
  field,
  value,
  onChange,
}: {
  field: TastingFormatField;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const options = field.options ?? [];
  return (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: `repeat(${field.cols ?? options.length}, minmax(0, 1fr))`,
      }}
      role="radiogroup"
      aria-label={field.label}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(value === o ? undefined : o)}
          className={cn(
            "min-h-11 rounded-[10px] border px-0.5 py-1 text-sm leading-tight touch-manipulation",
            value === o
              ? "border-primary bg-primary font-semibold text-primary-foreground"
              : "bg-background",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function MultiField({
  field,
  value,
  onChange,
}: {
  field: TastingFormatField;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const picked = new Set(value);
  return (
    <div className="flex flex-wrap gap-2">
      {(field.options ?? []).map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={picked.has(o)}
          onClick={() =>
            onChange(
              picked.has(o) ? value.filter((v) => v !== o) : [...value, o],
            )
          }
          className={cn(
            "min-h-11 rounded-full border px-3.5 text-[15px] touch-manipulation",
            picked.has(o)
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Family first ("Red"), then the shade swatch ("garnet"): "Red: garnet". */
function ColourField({
  field,
  value,
  onChange,
}: {
  field: TastingFormatField;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const families = field.families ?? {};
  const [family, shade] = (value ?? "").split(": ");
  const shades = families[family] ?? [];
  return (
    <div className="space-y-3">
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${Object.keys(families).length}, minmax(0, 1fr))`,
        }}
        role="radiogroup"
        aria-label="Colour"
      >
        {Object.keys(families).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={family === f}
            onClick={() => onChange(family === f ? undefined : f)}
            className={cn(
              "min-h-11 rounded-[10px] border text-sm touch-manipulation",
              family === f
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "bg-background",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      {shades.length > 0 && (
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${shades.length}, minmax(0, 1fr))`,
          }}
          role="radiogroup"
          aria-label="Shade"
        >
          {shades.map((s) => (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={shade === s.label}
              aria-label={s.label}
              onClick={() =>
                onChange(shade === s.label ? family : `${family}: ${s.label}`)
              }
              className="flex min-h-11 flex-col items-center gap-1.5 py-1 text-xs touch-manipulation"
            >
              <span
                className={cn(
                  "block size-11 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]",
                  shade === s.label &&
                    "outline-3 outline-offset-3 outline-primary",
                )}
                style={{ background: s.color }}
              />
              <span
                className={cn(
                  "text-center leading-tight",
                  shade === s.label && "font-bold",
                )}
              >
                {s.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
