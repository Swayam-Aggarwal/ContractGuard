import AppError from "../utils/appError.js";

import {
  buildAiTestSuggestionContext,
  AI_TEST_SUGGESTION_CONTEXT_VERSION,
  AI_TEST_SUGGESTION_OPERATIONS,
} from "./ai-test-suggestion-context.service.js";

import {
  createGeminiProvider,
} from "./gemini-provider.service.js";

import {
  persistAiGeneratedDraftTestCases,
} from "./ai-generated-test-case-persistence.service.js";

import {
  parseAiTestSuggestionOutput,
} from "../validators/aiTestSuggestion.validator.js";

export const AI_TEST_SUGGESTION_CONSENT_VERSION =
  "AI_TEST_SUGGESTION_CONSENT_V1";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

const SUPPORTED_OPERATIONS =
  AI_TEST_SUGGESTION_OPERATIONS;

const ALLOWED_PRODUCT_IDS = new Set([
  "1001",
  "1002",
  "1003",
  "9999",
]);

const ALLOWED_TEST_CATEGORIES = new Set([
  "HAPPY_PATH",
  "BOUNDARY",
  "NEGATIVE",
  "EDGE_CASE",
]);

const LIMIT_PATTERN =
  /^(?:[1-9]|[1-4]\d|50)$/u;

const createServiceError = (
  message,
  statusCode,
  code
) =>
  new AppError(message, {
    statusCode,
    code,
  });

const createConsentError = () =>
  createServiceError(
    "Explicit consent is required before sending synthetic context to Gemini.",
    400,
    "AI_CONSENT_REQUIRED"
  );

const createNotConfiguredError = () =>
  createServiceError(
    "AI test suggestions are not configured. Add GEMINI_API_KEY to the server environment.",
    503,
    "AI_NOT_CONFIGURED"
  );

const createInvalidOperationError = () =>
  createServiceError(
    "The selected operation could not be resolved against the trusted Demo Store baseline.",
    422,
    "AI_OPERATION_NOT_FOUND"
  );

const createInvalidOutputError = () =>
  createServiceError(
    "Gemini returned suggestions that do not match the selected operation or the required draft format.",
    502,
    "AI_INVALID_MODEL_OUTPUT"
  );

const createPersistenceResultError = () =>
  createServiceError(
    "ContractGuard could not confirm that all generated draft test cases were persisted.",
    500,
    "AI_TEST_CASE_PERSISTENCE_FAILED"
  );

const isPlainRecord = (value) => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
};

/*
 * Exact-key validation prevents additional model-generated fields
 * from entering the persistence layer.
 */
const hasExactKeys = (value, expectedKeys) => {
  if (!isPlainRecord(value)) {
    return false;
  }

  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();

  return (
    actual.length === expected.length &&
    actual.every(
      (key, index) => key === expected[index]
    )
  );
};

const normalizeId = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value);
};

const containsControlCharacters = (value) =>
  /[\u0000-\u001F\u007F]/u.test(value);

/*
 * Resolve the selected operation exclusively from ContractGuard's
 * trusted baseline operation index.
 *
 * The browser and Gemini never supply the canonical operation key.
 */
const resolveSelectedOperation = (
  context,
  operationId
) => {
  const definition =
    SUPPORTED_OPERATIONS[operationId];

  if (!definition) {
    throw createInvalidOperationError();
  }

  const baselineVersionId = normalizeId(
    context?.baselineVersionId
  );

  const operationIndex =
    context?.operationsByOperationId;

  if (
    context?.contextVersion !==
      AI_TEST_SUGGESTION_CONTEXT_VERSION ||
    !baselineVersionId ||
    !isPlainRecord(operationIndex) ||
    !Object.hasOwn(operationIndex, operationId)
  ) {
    throw createInvalidOperationError();
  }

  if (
    context.selectedOperationId !== undefined &&
    context.selectedOperationId !== null &&
    context.selectedOperationId !== operationId
  ) {
    throw createInvalidOperationError();
  }

  const trustedOperation = operationIndex[operationId];

  if (
    !isPlainRecord(trustedOperation) ||
    typeof trustedOperation.operationKey !== "string" ||
    !/^op_[A-Za-z0-9_-]{43}$/u.test(
      trustedOperation.operationKey
    ) ||
    trustedOperation.method !== definition.method ||
    trustedOperation.path !== definition.path ||
    normalizeId(trustedOperation.specVersionId) !==
      baselineVersionId
  ) {
    throw createInvalidOperationError();
  }

  return {
    operationId,
    operationKey: trustedOperation.operationKey,
    operationPath: definition.path,
    specVersionId: baselineVersionId,
    definition,
  };
};

/*
 * Build the exact provider context for one selected operation.
 *
 * Even if a context builder or test double provides multiple
 * operations, only the selected operation is sent to Gemini.
 */
const createSelectedModelContext = (
  context,
  selectedOperation
) => {
  const originalContext = context?.modelContext;

  if (
    !isPlainRecord(originalContext) ||
    originalContext.contextVersion !==
      AI_TEST_SUGGESTION_CONTEXT_VERSION ||
    !isPlainRecord(originalContext.comparison) ||
    !isPlainRecord(originalContext.comparison.baseline) ||
    !isPlainRecord(originalContext.comparison.candidate) ||
    !Array.isArray(originalContext.operations) ||
    !Array.isArray(
      originalContext.compatibilityFindings
    )
  ) {
    throw createInvalidOperationError();
  }

  const {
    operationId,
    definition,
  } = selectedOperation;

  const matchingOperations =
    originalContext.operations.filter(
      (operation) =>
        operation?.operationId === operationId &&
        operation?.method === definition.method &&
        operation?.path === definition.path
    );

  if (matchingOperations.length !== 1) {
    throw createInvalidOperationError();
  }

  const selectedFindings =
    originalContext.compatibilityFindings
      .filter(
        (finding) =>
          finding?.method === definition.method &&
          finding?.path === definition.path
      )
      .slice(0, 4)
      .map((finding) => ({
        category: finding.category,
        classification: finding.classification,
        method: definition.method,
        path: definition.path,
        field: finding.field,
        summary: finding.summary,
      }));

  return {
    contextVersion: originalContext.contextVersion,

    comparison: {
      baseline: {
        fixtureId:
          originalContext.comparison.baseline.fixtureId,

        apiVersion:
          originalContext.comparison.baseline.apiVersion,
      },

      candidate: {
        fixtureId:
          originalContext.comparison.candidate.fixtureId,

        apiVersion:
          originalContext.comparison.candidate.apiVersion,
      },

      direction:
        originalContext.comparison.direction,
    },

    operations: [
      {
        operationId,
        method: definition.method,
        path: definition.path,

        pathParameters: [
          ...definition.pathParameters,
        ],

        queryParameters: [
          ...definition.queryParameters,
        ],
      },
    ],

    compatibilityFindings: selectedFindings,
  };
};

const createPublicOperation = (
  operationId,
  definition
) => ({
  operationId,
  method: definition.method,
  path: definition.path,
});

/*
 * The preview can list all verified operations without requiring
 * their canonical keys to be included in the selected-operation
 * index.
 *
 * The context service supplies availableOperations after resolving
 * those definitions against the trusted baseline.
 *
 * The fallback supports injected context builders used by tests
 * and other internal callers that still return the full index.
 */
const createAvailableOperations = (context) => {
  const availableIds = new Set();

  if (Array.isArray(context?.availableOperations)) {
    for (const operation of context.availableOperations) {
      if (
        !isPlainRecord(operation) ||
        typeof operation.operationId !== "string" ||
        !Object.hasOwn(
          SUPPORTED_OPERATIONS,
          operation.operationId
        )
      ) {
        continue;
      }

      const definition =
        SUPPORTED_OPERATIONS[operation.operationId];

      if (
        operation.method === definition.method &&
        operation.path === definition.path
      ) {
        availableIds.add(operation.operationId);
      }
    }
  } else if (
    isPlainRecord(context?.operationsByOperationId)
  ) {
    for (const operationId of Object.keys(
      context.operationsByOperationId
    )) {
      if (
        Object.hasOwn(
          SUPPORTED_OPERATIONS,
          operationId
        )
      ) {
        availableIds.add(operationId);
      }
    }
  }

  return Object.entries(SUPPORTED_OPERATIONS)
    .filter(([operationId]) =>
      availableIds.has(operationId)
    )
    .map(([operationId, definition]) =>
      createPublicOperation(
        operationId,
        definition
      )
    );
};

/*
 * Validate the complete model output again at the service boundary.
 *
 * The selected operation is supplied by ContractGuard, not Gemini.
 * Gemini is allowed to return only scenario details and safe inputs.
 */
const normalizeSuggestions = (
  suggestions,
  selectedOperation
) => {
  if (
    !Array.isArray(suggestions) ||
    suggestions.length < 2 ||
    suggestions.length > 4
  ) {
    throw createInvalidOutputError();
  }

  const {
    operationId,
    definition,
  } = selectedOperation;

  const scenarioKeys = new Set();

  return suggestions.map((suggestion) => {
    if (
      !hasExactKeys(suggestion, [
        "title",
        "rationale",
        "testCategory",
        "pathParams",
        "queryParams",
      ])
    ) {
      throw createInvalidOutputError();
    }

    const title = suggestion.title;
    const rationale = suggestion.rationale;
    const testCategory = suggestion.testCategory;

    if (
      typeof title !== "string" ||
      title.length < 3 ||
      title.length > 120 ||
      containsControlCharacters(title) ||
      typeof rationale !== "string" ||
      rationale.length < 12 ||
      rationale.length > 500 ||
      containsControlCharacters(rationale) ||
      !ALLOWED_TEST_CATEGORIES.has(testCategory) ||
      !isPlainRecord(suggestion.pathParams) ||
      !isPlainRecord(suggestion.queryParams)
    ) {
      throw createInvalidOutputError();
    }

    const pathParams = {
      ...suggestion.pathParams,
    };

    const queryParams = {
      ...suggestion.queryParams,
    };

    const pathParameterNames =
      Object.keys(pathParams);

    const queryParameterNames =
      Object.keys(queryParams);

    if (
      pathParameterNames.some(
        (name) =>
          !definition.pathParameters.includes(name)
      ) ||
      queryParameterNames.some(
        (name) =>
          !definition.queryParameters.includes(name)
      )
    ) {
      throw createInvalidOutputError();
    }

    if (operationId === "listProducts") {
      if (
        pathParameterNames.length !== 0 ||
        (
          queryParams.limit !== undefined &&
          (
            typeof queryParams.limit !== "string" ||
            !LIMIT_PATTERN.test(queryParams.limit)
          )
        )
      ) {
        throw createInvalidOutputError();
      }
    }

    if (operationId === "getProduct") {
      if (
        pathParameterNames.length !== 1 ||
        typeof pathParams.productId !== "string" ||
        !ALLOWED_PRODUCT_IDS.has(
          pathParams.productId
        ) ||
        queryParameterNames.length !== 0
      ) {
        throw createInvalidOutputError();
      }
    }

    const scenarioKey = JSON.stringify({
      pathParams,
      queryParams,
    });

    if (scenarioKeys.has(scenarioKey)) {
      throw createInvalidOutputError();
    }

    scenarioKeys.add(scenarioKey);

    return {
      title,
      rationale,
      testCategory,
      pathParams,
      queryParams,
    };
  });
};

export const createAiTestSuggestionService = ({
  contextBuilder = buildAiTestSuggestionContext,
  providerFactory = createGeminiProvider,
  outputParser = parseAiTestSuggestionOutput,
  persistence = persistAiGeneratedDraftTestCases,
  now = () => new Date(),
} = {}) => {
  /*
   * Read-only preview.
   *
   * This method does not instantiate the Gemini provider and does
   * not transmit any context outside ContractGuard.
   */
  const getAiTestSuggestionPreview = async ({
    ownerId,
    projectId,
    reportId,
    operationId,
    config,
  }) => {
    if (
      !Object.hasOwn(
        SUPPORTED_OPERATIONS,
        operationId
      )
    ) {
      throw createInvalidOperationError();
    }

    const context = await contextBuilder({
      ownerId,
      projectId,
      reportId,
      operationId,
    });

    const selectedOperation = resolveSelectedOperation(
      context,
      operationId
    );

    const modelContext = createSelectedModelContext(
      context,
      selectedOperation
    );

    const selectedOperationPreview =
      createPublicOperation(
        operationId,
        selectedOperation.definition
      );

    const availableOperations =
      createAvailableOperations(context);

    return {
      provider: "Google Gemini",

      providerConfigured: Boolean(
        config?.GEMINI_API_KEY?.trim()
      ),

      selectedOperation:
        selectedOperationPreview,

      availableOperations,

      providerSubmissionPreview: {
        operation: selectedOperationPreview,
        context: modelContext,
      },
    };
  };

  const generateAiTestSuggestions = async ({
    ownerId,
    projectId,
    reportId,
    operationId,
    consent,
    config,
  }) => {
    if (consent !== true) {
      throw createConsentError();
    }

    if (
      !Object.hasOwn(
        SUPPORTED_OPERATIONS,
        operationId
      )
    ) {
      throw createInvalidOperationError();
    }

    /*
     * Check provider configuration before loading trusted context.
     * A missing key must not trigger report, specification, or
     * operation lookups, and must never instantiate Gemini.
     */
    if (!config?.GEMINI_API_KEY?.trim()) {
      throw createNotConfiguredError();
    }

    const context = await contextBuilder({
      ownerId,
      projectId,
      reportId,
      operationId,
    });

    const selectedOperation = resolveSelectedOperation(
      context,
      operationId
    );

    const modelContext = createSelectedModelContext(
      context,
      selectedOperation
    );

    const consentedAt = now();

    const provider = providerFactory({
      config,
    });

    const outputText = await provider.generateSuggestions(
      modelContext
    );

    const parsedSuggestions = outputParser(
      outputText,
      {
        operationId,
      }
    );

    const cases = normalizeSuggestions(
      parsedSuggestions,
      selectedOperation
    );

    const generatedAt = now();

    const model =
      config.GEMINI_MODEL?.trim() ||
      DEFAULT_GEMINI_MODEL;

    const generationMetadata = {
      provider: "Google Gemini",
      model,
      generatedAt,
      contextVersion: context.contextVersion,
      consentVersion:
        AI_TEST_SUGGESTION_CONSENT_VERSION,
      consentedAt,
    };

    /*
     * The operation's canonical identifiers come exclusively
     * from the trusted baseline context.
     *
     * Cases match the exact contract of the persistence service:
     * title, rationale, testCategory, pathParams, queryParams.
     *
     * Gemini never supplies an operation key, operation path,
     * assertion, or expected HTTP status.
     */
    const testCases = await persistence({
      ownerId,
      projectId,

      specVersionId:
        selectedOperation.specVersionId,

      operationId:
        selectedOperation.operationId,

      operationKey:
        selectedOperation.operationKey,

      operationPath:
        selectedOperation.operationPath,

      cases,

      generationMetadata,
    });

    if (
      !Array.isArray(testCases) ||
      testCases.length !== cases.length
    ) {
      throw createPersistenceResultError();
    }

    return {
      testCases,

      specVersionId:
        selectedOperation.specVersionId,

      selectedOperationId:
        selectedOperation.operationId,

      createdCount: testCases.length,

      provider: "Google Gemini",

      model,

      contextVersion: context.contextVersion,
    };
  };

  return {
    getAiTestSuggestionPreview,
    generateAiTestSuggestions,
  };
};

const aiTestSuggestionService =
  createAiTestSuggestionService();

export default aiTestSuggestionService;