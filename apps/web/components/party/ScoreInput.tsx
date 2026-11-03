"use client";

import { Star } from "lucide-react";
import type { TastingFormat } from "@cellarboss/types";
import { fromStoredScore, toStoredScore } from "@cellarboss/validators";
import { cn } from "@/lib/utils";

const QUICK_SCORES = [85, 88, 90, 92, 95];

type ScoreInputProps = {
  /** Stored score, 0-100, or null when unrated. */
  value: number | null;
  /** 10 is for tasting notes (0-10, stored as tens like the other scales). */
  scale: 100 | 10 | 5;
  onChange: (score: number | null) => void;
};

/** Big, thumb-friendly score entry: a 100-point slider or five stars. */
export function ScoreInput({ value, scale, onChange }: ScoreInputProps) {
  if (scale === 10) {
    const picked = value === null ? null : Math.round(value / 10);
    return (
      <div
        className="grid grid-cols-6 gap-2"
        role="radiogroup"
        aria-label="Score out of 10"
      >
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={picked === n}
            onClick={() => onChange(picked === n ? null : n * 10)}
            className={cn(
              "rounded-md border py-3 text-lg font-medium tabular-nums touch-manipulation",
              picked === n
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }
  if (scale === 5) {
    const stars = value === null ? 0 : fromStoredScore(value, 5);
    return (
      <div
        className="flex justify-between gap-1"
        role="radiogroup"
        aria-label="Score"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="p-2 -m-1 touch-manipulation"
            onClick={() => onChange(stars === n ? null : toStoredScore(n, 5))}
          >
            <Star
              className={cn(
                "h-11 w-11 transition-colors",
                n <= stars
                  ? "fill-amber-400 text-amber-500"
                  : "text-muted-foreground",
              )}
            />
          </button>
        ))}
      </div>
    );
  }

  const shown = value ?? 88;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span
          className={cn(
            "text-5xl font-bold tabular-nums",
            value === null && "text-muted-foreground",
          )}
        >
          {value ?? "—"}
        </span>
        <span className="text-sm text-muted-foreground">/ 100</span>
      </div>
      <input
        type="range"
        min={70}
        max={100}
        step={1}
        value={shown}
        aria-label="Score out of 100"
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-10 accent-primary touch-manipulation"
      />
      <div className="grid grid-cols-5 gap-2">
        {QUICK_SCORES.map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={cn(
              "rounded-md border py-3 text-base font-medium touch-manipulation",
              value === score
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background",
            )}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A stored score as the party shows it: a reaction word for formats rated
 * with reactions (beginner), otherwise stars or points.
 */
export function formatPartyScore(
  score: number | null,
  scale: 100 | 5,
  format?: TastingFormat | null,
) {
  if (score === null) return "—";
  if (format?.rating.kind === "reaction") {
    const nearest = format.rating.options.reduce((best, o) =>
      Math.abs(o.score - score) < Math.abs(best.score - score) ? o : best,
    );
    return nearest.label;
  }
  return scale === 5 ? `${fromStoredScore(score, 5)}★` : String(score);
}
