
import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    "ID must be a valid MongoDB ObjectId."
  );

export const createDiffReportSchema = z
  .object({
    baselineSpecVersionId: objectIdSchema,
    candidateSpecVersionId: objectIdSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.baselineSpecVersionId.toLowerCase() !==
      value.candidateSpecVersionId.toLowerCase(),
    {
      message:
        "Baseline and candidate must be different specification versions.",
      path: ["candidateSpecVersionId"],
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
