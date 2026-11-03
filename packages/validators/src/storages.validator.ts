import { z } from "zod";
import { nullableId, nullableInt } from "./form-helpers";

export const createStorageSchema = z.object({
  name: z.string().min(1).max(255).trim().describe("Name of the storage unit"),
  locationId: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("ID of the location, or null if not assigned"),
  parent: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("ID of the parent storage, or null if top-level"),
  capacity: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .nullable()
    .optional()
    .describe("Bottles it holds (one per slot), or null if not set"),
});

export const storageFormValidators = {
  name: createStorageSchema.shape.name,
  locationId: nullableId(),
  parent: nullableId(),
  capacity: nullableInt(1, 10000),
} as const;

export const updateStorageSchema = createStorageSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
