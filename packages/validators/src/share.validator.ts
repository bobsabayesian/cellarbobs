import { z } from "zod";

export const createShareLinkSchema = z.object({
  title: z.string().trim().min(1).max(120).describe("What the link is for"),
  message: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .describe("Shown to people who open the link"),
  expiresAt: z.iso
    .datetime({ offset: true })
    .describe("When the link stops working (ISO date-time)"),
  maxMarks: z
    .number()
    .int()
    .min(1)
    .max(500)
    .nullable()
    .optional()
    .describe("Most bottles one person can mark, or null for no limit"),
});

export const extendShareLinkSchema = z.object({
  expiresAt: z.iso.datetime({ offset: true }),
});

export const joinShareSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export const markShareSchema = z.object({
  vintageId: z.number().int().positive(),
});
