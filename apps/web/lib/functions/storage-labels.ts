import type { Storage } from "@cellarboss/types";
import { describeFree, type StorageFill } from "@cellarboss/common/storages";

/** Storages named "12 · 6 free" for pickers, where a capacity is set. */
export function withFreeSpace(
  storages: Storage[],
  fill: Map<number, StorageFill> | undefined,
): Storage[] {
  if (!fill) return storages;
  return storages.map((s) => {
    const free = describeFree(fill.get(s.id));
    return free ? { ...s, name: `${s.name} · ${free}` } : s;
  });
}
