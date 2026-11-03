import { describe, it, expect } from "vitest";
import type { Storage } from "@cellarboss/types";
import { describeFree, storageFill } from "../storages";

const s = (
  id: number,
  parent: number | null,
  capacity: number | null,
): Storage => ({ id, name: `S${id}`, parent, locationId: 1, capacity });

describe("storageFill", () => {
  // Rack (no capacity) > Bin A (12), Bin B (6); Fridge (24) on its own.
  const storages = [
    s(1, null, null),
    s(2, 1, 12),
    s(3, 1, 6),
    s(4, null, 24),
    s(5, null, null),
  ];
  const bottle = (storageId: number | null, status = "stored") => ({
    storageId,
    status,
  });
  const bottles = [
    ...Array.from({ length: 10 }, () => bottle(2)),
    ...Array.from({ length: 7 }, () => bottle(3)),
    bottle(2, "drunk"), // consumed bottles don't take a slot
    bottle(4, "in-tasting"),
    bottle(null),
  ];

  it("counts stored bottles and frees what's left", () => {
    const fill = storageFill(storages, bottles);
    expect(fill.get(2)).toEqual({ stored: 10, capacity: 12, free: 2 });
    expect(fill.get(3)).toEqual({ stored: 7, capacity: 6, free: -1 });
    expect(fill.get(4)).toEqual({ stored: 0, capacity: 24, free: 24 });
  });

  it("gives a parent without a capacity the sum of its children", () => {
    const fill = storageFill(storages, bottles);
    expect(fill.get(1)).toEqual({ stored: 17, capacity: 18, free: 1 });
    expect(fill.get(5)).toEqual({ stored: 0, capacity: null, free: null });
  });

  it("leaves a parent's capacity unset when only some children have one", () => {
    const partial = [s(1, null, null), s(2, 1, 12), s(3, 1, null)];
    const fill = storageFill(partial, [bottle(2), bottle(3), bottle(3)]);
    expect(fill.get(1)).toEqual({ stored: 3, capacity: null, free: null });
    expect(fill.get(2)).toEqual({ stored: 1, capacity: 12, free: 11 });
  });

  it("describes free space", () => {
    const fill = storageFill(storages, bottles);
    expect(describeFree(fill.get(2))).toBe("2 free");
    expect(describeFree(fill.get(3))).toBe("1 over");
    expect(describeFree({ stored: 6, capacity: 6, free: 0 })).toBe("full");
    expect(describeFree(fill.get(5))).toBe("");
  });

  it("survives circular parent data", () => {
    const loop = [s(1, 2, null), s(2, 1, null)];
    expect(storageFill(loop, []).get(1)?.capacity).toBeNull();
  });
});
