export interface Bottle {
  id: number;
  purchaseDate: string;
  purchasePrice: number;
  vintageId: number;
  storageId: number | null;
  status:
    | "ordered"
    | "stored"
    | "in-primeur"
    | "in-tasting"
    | "drunk"
    | "sold"
    | "gifted";
  size:
    | "piccolo"
    | "half"
    | "standard"
    | "litre"
    | "magnum"
    | "double-magnum"
    | "jeroboam"
    | "imperial"
    | "salmanazar"
    | "balthazar"
    | "nebuchadnezzar";
  /** ISO date the bottle was drunk, sold or given away; null while in the cellar */
  consumedDate: string | null;
  /** Free-text note about how the bottle left the cellar */
  consumedNote: string | null;
}

export type CreateBottle = Omit<
  Bottle,
  "id" | "consumedDate" | "consumedNote"
> &
  Partial<Pick<Bottle, "consumedDate" | "consumedNote">>;

export type UpdateBottle = Partial<Omit<Bottle, "id">>;

export type BottleCounts = Record<Bottle["status"], number>;
