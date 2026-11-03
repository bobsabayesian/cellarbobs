"use client";

import type { TastingNote } from "@cellarboss/types";
import { useApiQuery } from "@/hooks/use-api-query";
import { getTastingFormats } from "@/lib/api/tastingNotes";
import { Badge } from "@/components/ui/badge";

/**
 * The answers a note was written with ("Tannin: grippy"), in the order of
 * its format's questions. Nothing for quick and older notes.
 */
export function NoteAnswers({ note }: { note: TastingNote }) {
  const answers = note.answers ?? {};
  const hasAnswers = Object.keys(answers).length > 0;
  const formatsQuery = useApiQuery({
    queryKey: ["tastingFormats"],
    queryFn: getTastingFormats,
    staleTime: Infinity,
    enabled: hasAnswers,
  });
  if (!hasAnswers) return null;

  const format = formatsQuery.data?.find((f) => f.id === note.format);
  const labels = new Map(
    (format?.steps ?? [])
      .flatMap((s) => s.blocks.flatMap((b) => b.fields))
      .map((f, i) => [f.key, { label: f.label, order: i }]),
  );
  const entries = Object.entries(answers)
    .map(([key, value]) => ({
      key,
      label: labels.get(key)?.label ?? key,
      order: labels.get(key)?.order ?? 999,
      text: Array.isArray(value) ? value.join(", ") : value,
    }))
    .filter((e) => e.text)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {entries.map((e) => (
        <Badge key={e.key} variant="secondary" className="font-normal">
          <span className="text-muted-foreground">{e.label}:</span> {e.text}
        </Badge>
      ))}
    </div>
  );
}
