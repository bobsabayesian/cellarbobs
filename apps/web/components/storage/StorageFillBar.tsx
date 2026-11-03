import type { StorageFill } from "@cellarboss/common/storages";
import { cn } from "@/lib/utils";

/** "18 / 24" with a thin fill bar; just the count without a capacity. */
export function StorageFillBar({
  fill,
  className,
}: {
  fill: StorageFill | undefined;
  className?: string;
}) {
  if (!fill) return null;
  if (fill.capacity === null)
    return (
      <span
        className={cn("text-sm tabular-nums text-muted-foreground", className)}
      >
        {fill.stored}
      </span>
    );
  const ratio = fill.capacity > 0 ? fill.stored / fill.capacity : 1;
  const over = fill.stored > fill.capacity;
  return (
    <span className={cn("inline-flex min-w-28 flex-col gap-1", className)}>
      <span
        className={cn(
          "text-sm tabular-nums",
          over ? "font-medium text-destructive" : "text-foreground",
        )}
      >
        {fill.stored} / {fill.capacity}
        {over && " · over"}
      </span>
      <span
        className="block h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Fill"
        aria-valuemin={0}
        aria-valuemax={fill.capacity}
        aria-valuenow={fill.stored}
      >
        <span
          className={cn(
            "block h-full rounded-full",
            over
              ? "bg-destructive"
              : ratio >= 0.9
                ? "bg-amber-500"
                : "bg-primary",
          )}
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
        />
      </span>
    </span>
  );
}
