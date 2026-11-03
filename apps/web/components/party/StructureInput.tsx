"use client";

import type { PartyStructure } from "@cellarboss/types";
import { STRUCTURE_KEYS } from "@cellarboss/validators";
import { cn } from "@/lib/utils";

type StructureInputProps = {
  value: PartyStructure;
  onChange: (structure: PartyStructure) => void;
};

/** Acidity, tannin, body and oak, each tapped from 1 (low) to 5 (high). */
export function StructureInput({ value, onChange }: StructureInputProps) {
  return (
    <div className="space-y-3">
      {STRUCTURE_KEYS.map((key) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-16 text-sm capitalize">{key}</span>
          <div
            className="grid flex-1 grid-cols-5 gap-1.5"
            role="radiogroup"
            aria-label={key}
          >
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={value[key] === level}
                aria-label={`${key} ${level} of 5`}
                onClick={() => {
                  const next = { ...value };
                  if (next[key] === level) delete next[key];
                  else next[key] = level;
                  onChange(next);
                }}
                className={cn(
                  "h-10 rounded-md border text-sm touch-manipulation",
                  value[key] !== undefined && level <= value[key]!
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background",
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">1 = low · 5 = high</p>
    </div>
  );
}
