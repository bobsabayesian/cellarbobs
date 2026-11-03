import { z } from "zod";

export const TASTING_NOTE_FORMATS = ["quick", "beginner", "advanced"] as const;

/** Answers to a tasting format's questions, keyed by field. */
export const tastingNoteAnswersSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
);

export const createTastingNoteSchema = z.object({
  vintageId: z.number().int().positive(),
  score: z.number().int().min(0).max(10),
  notes: z.string().trim(),
  format: z.enum(TASTING_NOTE_FORMATS).nullable().optional(),
  answers: tastingNoteAnswersSchema.optional(),
});

export const tastingNoteFormValidators = {
  vintageId: z.coerce.number().int().positive("A vintage must be selected"),
  score: z.coerce
    .number()
    .int()
    .min(0, "Score must be 0-10")
    .max(10, "Score must be 0-10"),
  notes: z.string().trim(),
} as const;

export const updateTastingNoteSchema = z
  .object({
    score: z.number().int().min(0).max(10).optional(),
    notes: z.string().trim().optional(),
    answers: tastingNoteAnswersSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
