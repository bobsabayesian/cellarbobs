import type { Storage } from "@cellarboss/types";

/** Preference key for including sub-storage bottles on a storage's page. */
export const INCLUDE_SUB_STORAGES_PREFERENCE =
  "storages.bottles.includeSubStorages";

/** Build a map from each storage ID to the set of all its descendant IDs (including itself). */
export function buildDescendantsMap(
  storages: Storage[],
): Map<number, Set<number>> {
  const childrenMap = new Map<number, number[]>();
  for (const s of storages) {
    if (s.parent != null) {
      if (!childrenMap.has(s.parent)) childrenMap.set(s.parent, []);
      childrenMap.get(s.parent)!.push(s.id);
    }
  }

  // Walk each storage's subtree separately so circular parent references in
  // bad data can't leave a cached set incomplete
  const result = new Map<number, Set<number>>();
  for (const s of storages) {
    const desc = new Set<number>([s.id]);
    const stack = [s.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const childId of childrenMap.get(id) ?? []) {
        if (!desc.has(childId)) {
          desc.add(childId);
          stack.push(childId);
        }
      }
    }
    result.set(s.id, desc);
  }
  return result;
}

/**
 * Walk up the tree from a storage, returning the path from the top-level
 * storage down to (and including) the given storage.
 *
 * When `relativeTo` is given, the walk stops below that storage, so the path
 * is relative to it and a storage equal to `relativeTo` returns an empty path.
 */
export function getStorageAncestry(
  storageId: number | null | undefined,
  storageMap: Map<number, Storage>,
  relativeTo?: number,
): Storage[] {
  if (storageId == null) return [];
  const path: Storage[] = [];
  const seen = new Set<number>();
  let current = storageMap.get(storageId);
  while (current && current.id !== relativeTo && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current =
      current.parent != null ? storageMap.get(current.parent) : undefined;
  }
  return path;
}

export interface StorageFill {
  /** Bottles stored here, including in any storage inside it. */
  stored: number;
  /** Its own capacity, else the sum of its children's when all have one. */
  capacity: number | null;
  /** capacity - stored, or null without a capacity. Negative when over. */
  free: number | null;
}

/**
 * How full each storage is. Only bottles with status "stored" count: one
 * bottle is one slot, whatever its size.
 */
export function storageFill(
  storages: Storage[],
  bottles: { storageId: number | null; status: string }[],
): Map<number, StorageFill> {
  const direct = new Map<number, number>();
  for (const b of bottles)
    if (b.status === "stored" && b.storageId != null)
      direct.set(b.storageId, (direct.get(b.storageId) ?? 0) + 1);

  const descendants = buildDescendantsMap(storages);
  const children = new Map<number, Storage[]>();
  for (const s of storages)
    if (s.parent != null)
      children.set(s.parent, [...(children.get(s.parent) ?? []), s]);

  const capacityMemo = new Map<number, number | null>();
  const capacityOf = (s: Storage, seen = new Set<number>()): number | null => {
    if (capacityMemo.has(s.id)) return capacityMemo.get(s.id)!;
    if (seen.has(s.id)) return null; // circular parent data
    seen.add(s.id);
    let cap: number | null = s.capacity ?? null;
    if (cap === null) {
      // Only a sum when every sub-storage has one; a partial sum would
      // understate the space and make the parent look over-full.
      const kids = (children.get(s.id) ?? []).map((c) => capacityOf(c, seen));
      cap =
        kids.length > 0 && kids.every((k) => k !== null)
          ? (kids as number[]).reduce((a, b) => a + b, 0)
          : null;
    }
    capacityMemo.set(s.id, cap);
    return cap;
  };

  const result = new Map<number, StorageFill>();
  for (const s of storages) {
    let stored = 0;
    for (const id of descendants.get(s.id) ?? [s.id])
      stored += direct.get(id) ?? 0;
    const capacity = capacityOf(s);
    result.set(s.id, {
      stored,
      capacity,
      free: capacity === null ? null : capacity - stored,
    });
  }
  return result;
}

/** "6 free", "full", "2 over"; empty without a capacity. */
export function describeFree(fill: StorageFill | undefined): string {
  if (!fill || fill.free === null) return "";
  if (fill.free > 0) return `${fill.free} free`;
  if (fill.free === 0) return "full";
  return `${-fill.free} over`;
}
