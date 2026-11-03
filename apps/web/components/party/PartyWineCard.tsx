import { wineDisplayName } from "@/lib/functions/strings";
import type { PartyWine } from "@cellarboss/types";

/** The true wine behind a blind label. */
export function PartyWineCard({
  wine,
  broughtBy,
}: {
  wine: PartyWine;
  /** Shown when a guest brought the bottle. */
  broughtBy?: string | null;
}) {
  return (
    <div>
      <div className="text-lg font-semibold leading-tight">
        {wineDisplayName(wine.winemaker, wine.wineName)}
      </div>
      <div className="text-muted-foreground">
        {[
          wine.year ?? "NV",
          wine.grapes.join(", ") || null,
          [wine.region, wine.country].filter(Boolean).join(", ") || null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
      {broughtBy && (
        <div className="text-sm text-muted-foreground">
          Brought by {broughtBy}
        </div>
      )}
    </div>
  );
}
