
import { z } from "zod";

import AppError from "../utils/appError.js";

const ALLOWED_PRODUCT_IDS = [
  "1001",
  "1002",
  "1003",
  "9999",
];

const LIMIT_PATTERN =
  /^(?:[1-9]|[1-4]\d|50)$/u;

const OPERATION_IDS = [
  "listProducts",
  "getProduct",
];

const TEST_CATEGORIES = [
  "HAPPY_PATH",
  "BOUNDARY",
  "NEGATIVE",
  "EDGE_CASE",
];

const containsControlCharacters = (value) =>
  /[\u0000-\u001F\u007F]/u.test(value);

const safeTextSchema = (maximumLength, minimumLength = 1) =>
  z
    .string()
    .trim()
    .min(minimumLength)
    .max(maximumLength)
    .refine(
      (value) => !containsControlCharacters(value),
      "Text must not contain control characters."
    );

const suggestionSchema = z
  .object({
    title: safeTextSchema(120, 3),

    rationale: safeTextSchema(500, 12),

    testCategory: z.enum(TEST_CATEGORIES),

    pathParams: z
      .object({
        productId: z.string().max(4).optional(),
      })
      .strict(),

    queryParams: z
      .object({
        limit: z.string().regex(LIMIT_PATTERN).optional(),
      })
      .strict(),
  })
  .strict();

const modelResponseSchema = z
  .object({
    suggestions: z
      .array(suggestionSchema)
      .min(2)
      .max(4),
  })
  .strict();

export const MODEL_RESPONSE_JSON_SCHEMA = Object.freeze({
  type: "object",

  properties: {
    suggestions: {
      type: "array",
      minItems: 2,
      maxItems: 4,

      items: {
        type: "object",

        properties: {
          title: {
            type: "string",
          },

          rationale: {
            type: "string",
          },

          testCategory: {
            type: "string",
            enum: TEST_CATEGORIES,
          },

          pathParams: {
            type: "object",

            properties: {
              productId: {
                type: "string",
              },
            },

            additionalProperties: false,
          },

          queryParams: {
            type: "object",

            properties: {
              limit: {
                type: "string",
              },
            },

            additionalProperties: false,
          },
        },

        required: [
          "title",
          "rationale",
          "testCategory",
          "pathParams",
          "queryParams",
        ],

        additionalProperties: false,
      },
    },
  },

  required: ["suggestions"],

  additionalProperties: false,
});

const operationIdSchema = z.enum(OPERATION_IDS);

/*
 * Preview and generation are both scoped to one explicitly selected
 * trusted Demo Store operation.
 */
export const aiTestSuggestionPreviewQuerySchema = z
  .object({
    operationId: operationIdSchema,
  })
  .strict();

export const aiTestSuggestionRequestSchema = z
  .object({
    operationId: operationIdSchema,
    consent: z.literal(true),
  })
  .strict();

/*
 * Retained for any existing route or test that validates consent alone.
 * The generation route should use aiTestSuggestionRequestSchema so
 * operationId is validated as part of the same request.
 */
export const aiTestSuggestionConsentSchema = z
  .object({
    consent: z.literal(true),
  })
  .strict();

const createInvalidOutputError = () =>
  new AppError(
    "Gemini returned suggestions that did not satisfy ContractGuard's validation rules for the selected operation.",
    {
      statusCode: 502,
      code: "AI_INVALID_MODEL_OUTPUT",
    }
  );

const createStableScenarioKey = (suggestion) => {
  const sortRecord = (record) =>
    Object.fromEntries(
      Object.entries(record).sort(
        ([left], [right]) => left.localeCompare(right)
      )
    );

  return JSON.stringify({
    pathParams: sortRecord(suggestion.pathParams),
    queryParams: sortRecord(suggestion.queryParams),
  });
};

export const parseAiTestSuggestionOutput = (
  outputText,
  { operationId } = {}
) => {
  if (
    !OPERATION_IDS.includes(operationId) ||
    typeof outputText !== "string" ||
    outputText.length === 0 ||
    Buffer.byteLength(outputText, "utf8") > 16_000
  ) {
    throw createInvalidOutputError();
  }

  let parsedJson;

  try {
    parsedJson = JSON.parse(outputText);
  } catch {
    throw createInvalidOutputError();
  }

  const result = modelResponseSchema.safeParse(parsedJson);

  if (!result.success) {
    throw createInvalidOutputError();
  }

  const suggestions = result.data.suggestions;

  const scenarioKeys = new Set();

  for (const suggestion of suggestions) {
    const pathKeys = Object.keys(suggestion.pathParams);
    const queryKeys = Object.keys(suggestion.queryParams);

    if (operationId === "listProducts") {
      if (pathKeys.length !== 0) {
        throw createInvalidOutputError();
      }

      if (
        queryKeys.some((key) => key !== "limit")
      ) {
        throw createInvalidOutputError();
      }

      if (
        suggestion.queryParams.limit !== undefined &&
        !LIMIT_PATTERN.test(suggestion.queryParams.limit)
      ) {
        throw createInvalidOutputError();
      }
    }

    if (operationId === "getProduct") {
      if (
        pathKeys.length !== 1 ||
        suggestion.pathParams.productId === undefined ||
        !ALLOWED_PRODUCT_IDS.includes(
          suggestion.pathParams.productId
        ) ||
        queryKeys.length !== 0
      ) {
        throw createInvalidOutputError();
      }
    }

    const scenarioKey = createStableScenarioKey(
      suggestion
    );

    if (scenarioKeys.has(scenarioKey)) {
      throw createInvalidOutputError();
    }

    scenarioKeys.add(scenarioKey);
  }

  return suggestions;
};
