import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    "ID must be a valid MongoDB ObjectId."
  );

const currentComparisonInputSchema = z
  .object({
    baselineVersionId: objectIdSchema,
    candidateVersionId: objectIdSchema,
  })
  .strict();

// Phase 4 clients used the longer names. Keep accepting them during the
// transition while the public comparison contract uses baselineVersionId.
const legacyComparisonInputSchema = z
  .object({
    baselineSpecVersionId: objectIdSchema,
    candidateSpecVersionId: objectIdSchema,
  })
  .strict();

export const createDiffReportSchema = z
  .union([
    currentComparisonInputSchema,
    legacyComparisonInputSchema,
  ])
  .transform((value) => ({
    baselineSpecVersionId:
      value.baselineVersionId ?? value.baselineSpecVersionId,

    candidateSpecVersionId:
      value.candidateVersionId ?? value.candidateSpecVersionId,
  }))
  .refine(
    (value) =>
      value.baselineSpecVersionId.toLowerCase() !==
      value.candidateSpecVersionId.toLowerCase(),
    {
      message:
        "Baseline and candidate must be different specification versions.",

      path: ["candidateVersionId"],
    }
  );

export const diffReportParamsSchema = z
  .object({
    projectId: objectIdSchema,
    reportId: objectIdSchema,
  })
  .strict();

export const listDiffReportsQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20),
  })
  .strict();