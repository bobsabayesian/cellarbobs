import type { Bottle } from "@cellarboss/types";

/** Bottles that are on their way: ordered, or bought en primeur. */
export const PENDING_STATUSES: readonly Bottle["status"][] = [
  "ordered",
  "in-primeur",
];
