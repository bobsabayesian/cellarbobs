import type { GenericType } from "./generic";

export interface Storage extends GenericType {
  locationId: number | null;
  parent: number | null;
  /** Bottles it holds (one per slot, any size); null when not set. */
  capacity: number | null;
  /** The user whose personal "unsorted" storage this is, if it is one. */
  personalFor?: string | null;
}

export type CreateStorage = Omit<Storage, "id" | "capacity" | "personalFor"> &
  Partial<Pick<Storage, "capacity">>;

export type UpdateStorage = Partial<Omit<Storage, "id" | "personalFor">>;

/** What a user may do with a storage (and everything under it). */
export type AccessLevel = "view" | "edit";

export interface StorageGrant {
  storageId: number;
  userId: string;
  level: AccessLevel;
}

/** Everything the admin's access screen needs in one response. */
export interface StorageAccessOverview {
  users: { id: string; name: string; email: string; role: string }[];
  storages: Pick<Storage, "id" | "name" | "parent" | "locationId">[];
  grants: StorageGrant[];
}
