import type { GenericType } from "./generic";

export interface Storage extends GenericType {
  locationId: number | null;
  parent: number | null;
  /** Bottles it holds (one per slot, any size); null when not set. */
  capacity: number | null;
}

export type CreateStorage = Omit<Storage, "id" | "capacity"> &
  Partial<Pick<Storage, "capacity">>;

export type UpdateStorage = Partial<Omit<Storage, "id">>;
