
import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/iu);
const operationKeySchema = z.string().regex(/^op_[A-Za-z0-9_-]{43}$/u);

const isBoundedJsonValue = (value) => {
  let nodes = 0;
  let valid = true;

  const visit = (current, depth) => {
    nodes += 1;

    if (nodes > 500 || depth > 6) {
      valid = false;
      return;
    }

    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    ) {
      if (typeof current === "string" && current.length > 500) valid = false;
      return;
    }

    if (typeof current === "number") {
      if (!Number.isFinite(current)) valid = false;
      return;
    }

    if (Array.isArray(current)) {
      if (current.length > 100) valid = false;
      for (const item of current) visit(item, depth + 1);
      return;
    }

    if (typeof current === "object") {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        valid = false;
        return;
      }

      const entries = Object.entries(current);
      if (entries.length > 100) valid = false;

      for (const [key, item] of entries) {
        if (["__proto__", "prototype", "constructor"].includes(key)) {
          valid = false;
          continue;
        }
        visit(item, depth + 1);
      }
      return;
    }

    valid = false;
  };

  visit(value, 0);

  if (!valid) return false;

  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= 4096;
  } catch {
    return false;
  }
};

const jsonValueSchema = z.unknown().refine(
  isBoundedJsonValue,
  "Value must be bounded JSON data."
);

const inputRecordSchema = z
  .record(
    z.string().trim().min(1).max(200),
    z.string().max(256)
  )
  .superRefine((value, context) => {
    const entries = Object.entries(value);

    if (entries.length > 20) {
      context.addIssue({
        code: "custom",
        message: "At most 20 parameter values are allowed per location.",
      });
    }

    for (const [key] of entries) {
      if (
        ["__proto__", "prototype", "constructor"].includes(key) ||
        key.includes(".") ||
        key.startsWith("$") ||
        key.includes("\u0000")
      ) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "This parameter name cannot be stored safely by the test-case model.",
        });
      }
    }
  });

const requestSchema = z
  .object({
    pathParams: inputRecordSchema.default({}),
    queryParams: inputRecordSchema.default({}),
  })
  .strict();

const propertyPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(
    /^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)*$/u,
    "Use a dot-separated response property path."
  )
  .refine(
    (value) => !value.split(".").some((part) =>
      ["__proto__", "prototype", "constructor"].includes(part)
    ),
    "Prototype-related property names are not supported."
  );

const propertyAssertionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("VALUE"),
      path: propertyPathSchema,
      value: jsonValueSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("PRESENCE"),
      path: propertyPathSchema,
      present: z.boolean(),
    })
    .strict(),
]);

const assertionsSchema = z
  .object({
    expectedStatus: z.number().int().min(100).max(599).optional(),
    propertyAssertions: z.array(propertyAssertionSchema).max(20).default([]),
    requiredProperties: z.array(propertyPathSchema).max(20).default([]),
  })
  .strict();

const titleSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().max(1000).default("");

export const specVersionTestCasesParamsSchema = z
  .object({ specVersionId: objectIdSchema })
  .strict();

export const testCaseParamsSchema = z
  .object({ testCaseId: objectIdSchema })
  .strict();

export const createTestCaseSchema = z
  .object({
    operationKey: operationKeySchema,
    operationPath: z.string().trim().min(1).max(1000),
    title: titleSchema,
    description: descriptionSchema,
    request: requestSchema.default({ pathParams: {}, queryParams: {} }),
    assertions: assertionsSchema.default({
      propertyAssertions: [],
      requiredProperties: [],
    }),
  })
  .strict();

export const updateTestCaseSchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().trim().max(1000).optional(),
    request: requestSchema.optional(),
    assertions: assertionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one draft field to update.",
  });
