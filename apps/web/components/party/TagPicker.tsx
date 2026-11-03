"use client";

import { cn } from "@/lib/utils";

type TagPickerProps = {
  /** Tags to offer, grouped; from the host's tags file via the party. */
  groups: Record<string, readonly string[]>;
  value: string[];
  onChange: (tags: string[]) => void;
};

/** Quick-tap aroma and flavour chips, grouped. */
export function TagPicker({ groups, value, onChange }: TagPickerProps) {
  const selected = new Set(value);
  const toggle = (tag: string) => {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange([...next]);
  };

  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([group, tags]) => (
        <div key={group}>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
            {group}
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={selected.has(tag)}
                onClick={() => toggle(tag)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm touch-manipulation",
                  selected.has(tag)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
