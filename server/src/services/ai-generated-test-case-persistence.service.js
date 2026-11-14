import TestCase from "../models/testCase.model.js";

import specVersionService from "./specVersion.service.js";

import specificationExplorerService from
  "./specification-explorer.service.js";

import {
  toPublicTestCase,
} from "./testCase.service.js";

import AppError from "../utils/appError.js";

const MAX_TEST_CASES_PER_SPECIFICATION = 500;

const ALLOWED_PRODUCT_IDS = new Set([
  "1001",
  "1002",
  "1003",
  "9999",
]);

const OPERATION_DEFINITIONS = Object.freeze({
  listProducts: {
    method: "GET",
    path: "/products",
    pathParameters: [],
    queryParameters: ["limit"],
  },

  getProduct: {
    method: "GET",
    path: "/products/{productId}",
    pathParameters: ["productId"],
    queryParameters: [],
  },
});

const createPersistenceError = (
  message,
  statusCode = 422,
  code = "AI_TEST_CASE_PERSISTENCE_FAILED"
) =>
  new AppError(message, {
    statusCode,
    code,
  });

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

const normalizeRequest = (
  request,
  operationId
) => {
  if (!isPlainRecord(request)) {
    throw createPersistenceError(
      "The generated request inputs are invalid."
    );
  }

  const pathParams = request.pathParams ?? {};
  const queryParams = request.queryParams ?? {};

  if (
    !isPlainRecord(pathParams) ||
    !isPlainRecord(queryParams)
  ) {
    throw createPersistenceError(
      "Generated path and query inputs must be plain objects."
    );
  }

  const definition =
    OPERATION_DEFINITIONS[operationId];

  if (!definition) {
    throw createPersistenceError(
      "The generated operation is not supported."
    );
  }

  const pathEntries = Object.entries(pathParams);
  const queryEntries = Object.entries(queryParams);

  const containsUnsafeKey = (entries) =>
    entries.some(([name]) =>
      [
        "__proto__",
        "prototype",
        "constructor",
      ].includes(name) ||
      name.includes("\u0000") ||
      name.includes(".") ||
      name.startsWith("$")
    );

  if (
    containsUnsafeKey(pathEntries) ||
    containsUnsafeKey(queryEntries) ||
    pathEntries.some(
      ([name]) =>
        !definition.pathParameters.includes(name)
    ) ||
    queryEntries.some(
      ([name]) =>
        !definition.queryParameters.includes(name)
    )
  ) {
    throw createPersistenceError(
      "The generated request contains unsupported parameter names."
    );
  }

  for (const [, value] of [
    ...pathEntries,
    ...queryEntries,
  ]) {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 256
    ) {
      throw createPersistenceError(
        "Generated parameter values must be non-empty strings of at most 256 characters."
      );
    }
  }

  if (operationId === "getProduct") {
    if (
      pathParams.productId === undefined ||
      !ALLOWED_PRODUCT_IDS.has(pathParams.productId) ||
      queryEntries.length !== 0
    ) {
      throw createPersistenceError(
        "The generated product request contains an unsupported product identifier or query parameter."
      );
    }
  }

  if (operationId === "listProducts") {
    if (pathEntries.length !== 0) {
      throw createPersistenceError(
        "The list-products operation does not accept path parameters."
      );
    }

    if (
      queryParams.limit !== undefined &&
      !/^(?:[1-9]|[1-4]\d|50)$/u.test(queryParams.limit)
    ) {
      throw createPersistenceError(
        "The list-products limit must be an integer between 1 and 50."
      );
    }
  }

  return {
    pathParams: { ...pathParams },
    queryParams: { ...queryParams },
  };
};

const validateRequestAgainstOperation = (
  request,
  operation,
  operationId
) => {
  const definition =
    OPERATION_DEFINITIONS[operationId];

  if (
    !definition ||
    operation.kind !== "path" ||
    operation.method !== definition.method ||
    operation.path !== definition.path ||
    operation.operationId !== operationId
  ) {
    throw createPersistenceError(
      "The resolved operation does not match the trusted baseline operation definition."
    );
  }

  const normalized = normalizeRequest(
    request,
    operationId
  );

  const actualParameters = Array.isArray(
    operation.parameters
  )
    ? operation.parameters
    : [];

  for (const [location, values, allowedNames] of [
    [
      "path",
      normalized.pathParams,
      definition.pathParameters,
    ],
    [
      "query",
      normalized.queryParams,
      definition.queryParameters,
    ],
  ]) {
    const definitions = actualParameters.filter(
      (parameter) => parameter.in === location
    );

    for (const name of Object.keys(values)) {
      if (!allowedNames.includes(name)) {
        throw createPersistenceError(
          `The generated ${location} parameter '${name}' is not supported.`
        );
      }

      if (
        !definitions.some(
          (parameter) => parameter.name === name
        )
      ) {
        throw createPersistenceError(
          `The generated ${location} parameter '${name}' does not exist in the baseline operation.`
        );
      }
    }

    for (const parameter of definitions) {
      if (
        parameter.required === true &&
        values[parameter.name] === undefined
      ) {
        throw createPersistenceError(
          `The required ${location} parameter '${parameter.name}' is missing.`
        );
      }
    }
  }

  return normalized;
};

const createDeterministicAssertions = (
  operationId,
  request
) => {
  if (operationId === "listProducts") {
    return {
      expectedStatus: 200,
      propertyAssertions: [],

      // V1 requires items. The total field is optional.
      requiredProperties: [
        "items",
      ],
    };
  }

  if (operationId === "getProduct") {
    const notFound =
      request.pathParams.productId === "9999";

    if (notFound) {
      return {
        expectedStatus: 404,
        propertyAssertions: [],
        requiredProperties: [
          "code",
          "message",
        ],
      };
    }

    return {
      expectedStatus: 200,
      propertyAssertions: [],
      requiredProperties: [
        "id",
        "name",
        "description",
        "price",
        "currency",
        "stock",
      ],
    };
  }

  throw createPersistenceError(
    "The operation does not have a deterministic baseline assertion contract."
  );
};

const validateGenerationMetadata = (metadata) => {
  if (
    !metadata ||
    metadata.provider !== "Google Gemini" ||
    typeof metadata.model !== "string" ||
    metadata.model.length === 0 ||
    !(metadata.generatedAt instanceof Date) ||
    typeof metadata.contextVersion !== "string" ||
    typeof metadata.consentVersion !== "string" ||
    !(metadata.consentedAt instanceof Date)
  ) {
    throw createPersistenceError(
      "The AI generation and consent audit metadata is incomplete.",
      500,
      "AI_TEST_CASE_AUDIT_METADATA_INVALID"
    );
  }
};

export const createAiGeneratedTestCasePersistenceService = ({
  TestCaseModel = TestCase,
  specificationService = specVersionService,
  explorerService = specificationExplorerService,
  serializeTestCase = toPublicTestCase,
} = {}) => {
  const persistAiGeneratedDraftTestCases = async ({
    ownerId,
    projectId,
    specVersionId,
    operationId,
    operationKey,
    operationPath,
    cases,
    generationMetadata,
  }) => {
    if (
      !Array.isArray(cases) ||
      cases.length < 2 ||
      cases.length > 4
    ) {
      throw createPersistenceError(
        "A generation batch must contain between two and four test cases."
      );
    }

    validateGenerationMetadata(generationMetadata);

    const specification =
      await specificationService.getSpecificationVersionRecord(
        ownerId,
        specVersionId
      );

    if (
      String(specification.projectId) !== String(projectId)
    ) {
      throw createPersistenceError(
        "The baseline specification does not belong to this project.",
        404,
        "RESOURCE_NOT_FOUND"
      );
    }

    const existingCount = await TestCaseModel.countDocuments({
      projectId: specification.projectId,
      specVersionId: specification._id,
    }).exec();

    if (
      existingCount + cases.length >
      MAX_TEST_CASES_PER_SPECIFICATION
    ) {
      throw createPersistenceError(
        "The specification has reached the maximum of 500 test cases.",
        422,
        "TEST_CASE_LIMIT_EXCEEDED"
      );
    }

    const operationResult =
      await explorerService.getSpecificationOperation(
        ownerId,
        String(specification._id),
        operationKey
      );

    const operation = operationResult?.operation;

    if (
      !operation ||
      operation.operationKey !== operationKey ||
      operation.path !== operationPath ||
      operation.method !== "GET" ||
      operation.operationId !== operationId ||
      operation.kind !== "path"
    ) {
      throw createPersistenceError(
        "The canonical operation could not be resolved from the baseline specification."
      );
    }

    const preparedRecords = [];
    const scenarioKeys = new Set();

    for (const generatedCase of cases) {
      const request = validateRequestAgainstOperation(
        {
          pathParams: generatedCase.pathParams,
          queryParams: generatedCase.queryParams,
        },
        operation,
        operationId
      );

      const scenarioKey = JSON.stringify({
        operationId,
        pathParams: request.pathParams,
        queryParams: request.queryParams,
      });

      if (scenarioKeys.has(scenarioKey)) {
        throw createPersistenceError(
          "The generation batch contains duplicate request scenarios."
        );
      }

      scenarioKeys.add(scenarioKey);

      const title =
        typeof generatedCase.title === "string"
          ? generatedCase.title.trim()
          : "";

      const rationale =
        typeof generatedCase.rationale === "string"
          ? generatedCase.rationale.trim()
          : "";

      const testCategory =
        typeof generatedCase.testCategory === "string"
          ? generatedCase.testCategory
          : "";

      if (
        title.length < 3 ||
        title.length > 120 ||
        rationale.length < 12 ||
        rationale.length > 500 ||
        ![
          "HAPPY_PATH",
          "BOUNDARY",
          "NEGATIVE",
          "EDGE_CASE",
        ].includes(testCategory)
      ) {
        throw createPersistenceError(
          "A generated title, rationale, or test category is invalid."
        );
      }

      preparedRecords.push({
        projectId: specification.projectId,
        specVersionId: specification._id,

        operationKey: operation.operationKey,
        operationPath: operation.path,

        title,

        description: `${testCategory}: ${rationale}`,

        source: "AI",
        status: "DRAFT",

        request,

        // Assertions are generated by ContractGuard.
        // Gemini never supplies expected statuses or assertions.
        assertions: createDeterministicAssertions(
          operationId,
          request
        ),

        generationMetadata: {
          provider: generationMetadata.provider,
          model: generationMetadata.model,
          generatedAt: generationMetadata.generatedAt,
          contextVersion: generationMetadata.contextVersion,
          consentVersion: generationMetadata.consentVersion,
          consentedAt: generationMetadata.consentedAt,
        },

        approvedAt: null,
      });
    }

    // Validate every record before attempting database insertion.
    const documents = preparedRecords.map(
      (record) => new TestCaseModel(record)
    );

    await Promise.all(
      documents.map((document) => document.validate())
    );

    const insertedRecords =
      await TestCaseModel.insertMany(
        documents,
        {
          ordered: true,
        }
      );

    return insertedRecords.map(serializeTestCase);
  };

  return {
    persistAiGeneratedDraftTestCases,
  };
};

const defaultPersistenceService =
  createAiGeneratedTestCasePersistenceService();

export const persistAiGeneratedDraftTestCases = (input) =>
  defaultPersistenceService.persistAiGeneratedDraftTestCases(input);

export default persistAiGeneratedDraftTestCases;