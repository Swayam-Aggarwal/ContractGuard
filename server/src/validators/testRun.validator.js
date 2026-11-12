import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/iu);

export const diffReportTestRunsParamsSchema = z
  .object({
    projectId: objectIdSchema,
    reportId: objectIdSchema,
  })
  .strict();

export const testRunParamsSchema = z
  .object({
    projectId: objectIdSchema,
    reportId: objectIdSchema,
    testRunId: objectIdSchema,
  })
  .strict();

export const createTestRunSchema = z
  .object({
    testCaseIds: z.array(objectIdSchema).min(1).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const normalized = value.testCaseIds.map(
      (id) => id.toLowerCase()
    );

    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({
        code: "custom",
        path: ["testCaseIds"],
        message: "A test case cannot be selected more than once.",
      });
    }
  });