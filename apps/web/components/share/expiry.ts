import type { ShareLinkState } from "@cellarboss/types";

/** "yyyy-mm-dd" for a date input, in local time. */
export function dateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The end of the chosen local day, as an ISO timestamp. */
export function endOfDay(value: string): string {
  return new Date(`${value}T23:59:59`).toISOString();
}

const FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatExpiry(iso: string): string {
  return FORMAT.format(new Date(iso));
}

/** "in 3 days", "in 5 hours", "expired". */
export function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "in under an hour";
  if (hours < 48) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `in ${Math.round(hours / 24)} days`;
}

/** Badge variant for a link's state. */
export const STATE_VARIANT: Record<
  ShareLinkState,
  "default" | "secondary" | "outline"
> = { active: "default", expired: "secondary", revoked: "outline" };
