import mongoose from "mongoose";

import TestCase from "../models/testCase.model.js";
import specVersionService from "./specVersion.service.js";
import specificationExplorerService from "./specification-explorer.service.js";
import AppError from "../utils/appError.js";

const MAX_INPUTS = 20;
const MAX_TEST_CASES_PER_SPECIFICATION = 500;

const createNotFoundError = () =>
  new AppError("Test case not found.", {
    statusCode: 404,
    code: "RESOURCE_NOT_FOUND",
  });

const createValidationError = (message, field) =>
  new AppError(message, {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    details: [{ field, message }],
  });

const createConflictError = (message) =>
  new AppError(message, {
    statusCode: 409,
    code: "TEST_CASE_STATE_CONFLICT",
  });

const createTestCaseLimitError = () =>
  new AppError(
    `A specification can contain at most ${MAX_TEST_CASES_PER_SPECIFICATION} test cases in this release.`,
    {
      statusCode: 422,
      code: "TEST_CASE_LIMIT_EXCEEDED",
    }
  );

const isValidObjectId = (value) =>
  mongoose.isObjectIdOrHexString(value);

const toObject = (value) => {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }

  if (value && typeof value.toObject === "function") {
    return value.toObject({ flattenMaps: true });
  }

  return value ?? {};
};

export const toPublicTestCase = (record) => ({
  id: String(record._id),
  projectId: String(record.projectId),
  specVersionId: String(record.specVersionId),
  operationKey: record.operationKey,
  operationPath: record.operationPath,
  title: record.title,
  description: record.description ?? "",
  source: record.source,
  status: record.status,
  request: {
    pathParams: toObject(record.request?.pathParams),
    queryParams: toObject(record.request?.queryParams),
  },
  assertions: {
    ...(record.assertions?.expectedStatus !== undefined
      ? { expectedStatus: record.assertions.expectedStatus }
      : {}),
    propertyAssertions:
      record.assertions?.propertyAssertions ?? [],
    requiredProperties:
      record.assertions?.requiredProperties ?? [],
  },
  generationMetadata: record.generationMetadata ?? null,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  approvedAt: record.approvedAt ?? null,
});

const getOwnedSpecification = async (
  ownerId,
  specVersionId
) => {
  if (
    !isValidObjectId(ownerId) ||
    !isValidObjectId(specVersionId)
  ) {
    throw createNotFoundError();
  }

  return specVersionService.getSpecificationVersionRecord(
    ownerId,
    specVersionId
  );
};

const getOwnedTestCaseRecord = async (
  ownerId,
  testCaseId
) => {
  if (
    !isValidObjectId(ownerId) ||
    !isValidObjectId(testCaseId)
  ) {
    throw createNotFoundError();
  }

  const record = await TestCase.findById(testCaseId)
    .lean()
    .exec();

  if (!record) {
    throw createNotFoundError();
  }

  const specification = await getOwnedSpecification(
    ownerId,
    record.specVersionId.toString()
  );

  if (
    specification.projectId.toString() !==
    record.projectId.toString()
  ) {
    throw createNotFoundError();
  }

  return record;
};

const getOperationContext = async (
  ownerId,
  specification,
  operationKey,
  operationPath
) => {
  const detail =
    await specificationExplorerService.getSpecificationOperation(
      ownerId,
      specification._id.toString(),
      operationKey
    );

  const operation = detail.operation;

  if (
    operation.kind !== "path" ||
    operation.method !== "GET" ||
    operation.path !== operationPath
  ) {
    throw createValidationError(
      "Select an existing GET path operation from this baseline specification.",
      "operationKey"
    );
  }

  return operation;
};

const normalizeRequest = (request = {}) => ({
  pathParams: {
    ...toObject(request.pathParams),
  },
  queryParams: {
    ...toObject(request.queryParams),
  },
});

const validateRequestAgainstOperation = (
  request,
  operation
) => {
  const normalized = normalizeRequest(request);

  const parameters = Array.isArray(operation.parameters)
    ? operation.parameters
    : [];

  const pathParameters = parameters.filter(
    (parameter) =>
      parameter?.in === "path" &&
      typeof parameter.name === "string"
  );

  const queryParameters = parameters.filter(
    (parameter) =>
      parameter?.in === "query" &&
      typeof parameter.name === "string"
  );

  const pathNames = new Set(
    pathParameters.map((parameter) => parameter.name)
  );

  const queryNames = new Set(
    queryParameters.map((parameter) => parameter.name)
  );

  for (const key of Object.keys(normalized.pathParams)) {
    if (!pathNames.has(key)) {
      throw createValidationError(
        `Path parameter '${key}' is not declared by the selected operation.`,
        `request.pathParams.${key}`
      );
    }
  }

  for (const key of Object.keys(normalized.queryParams)) {
    if (!queryNames.has(key)) {
      throw createValidationError(
        `Query parameter '${key}' is not declared by the selected operation.`,
        `request.queryParams.${key}`
      );
    }
  }

  if (
    Object.keys(normalized.pathParams).length +
      Object.keys(normalized.queryParams).length >
    MAX_INPUTS
  ) {
    throw createValidationError(
      `At most ${MAX_INPUTS} parameter values may be stored in one test case.`,
      "request"
    );
  }

  for (const parameter of pathParameters) {
    const value = normalized.pathParams[parameter.name];

    if (
      typeof value !== "string" ||
      value.length === 0
    ) {
      throw createValidationError(
        `A non-empty value is required for path parameter '${parameter.name}'.`,
        `request.pathParams.${parameter.name}`
      );
    }
  }

  for (const parameter of queryParameters.filter(
    (entry) => entry.required === true
  )) {
    const value = normalized.queryParams[parameter.name];

    if (
      typeof value !== "string" ||
      (
        value.length === 0 &&
        parameter.allowEmptyValue !== true
      )
    ) {
      throw createValidationError(
        `A value is required for query parameter '${parameter.name}'.`,
        `request.queryParams.${parameter.name}`
      );
    }
  }

  for (const [
    location,
    values,
    definitions,
  ] of [
    [
      "pathParams",
      normalized.pathParams,
      pathParameters,
    ],
    [
      "queryParams",
      normalized.queryParams,
      queryParameters,
    ],
  ]) {
    const definitionByName = new Map(
      definitions.map((parameter) => [
        parameter.name,
        parameter,
      ])
    );

    for (const [name, value] of Object.entries(values)) {
      if (
        typeof value !== "string" ||
        value.length > 256
      ) {
        throw createValidationError(
          "Parameter values must be strings of at most 256 characters.",
          `request.${location}.${name}`
        );
      }

      const definition = definitionByName.get(name);

      if (
        value.length === 0 &&
        definition?.allowEmptyValue !== true
      ) {
        throw createValidationError(
          `Parameter '${name}' does not allow an empty value.`,
          `request.${location}.${name}`
        );
      }
    }
  }

  return normalized;
};

const validateForBaseline = async (
  ownerId,
  specification,
  operationKey,
  operationPath,
  request
) => {
  const operation = await getOperationContext(
    ownerId,
    specification,
    operationKey,
    operationPath
  );

  return validateRequestAgainstOperation(
    request,
    operation
  );
};

const listTestCases = async (
  ownerId,
  specVersionId
) => {
  const specification = await getOwnedSpecification(
    ownerId,
    specVersionId
  );

  const records = await TestCase.find({
    projectId: specification.projectId,
    specVersionId: specification._id,
  })
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(500)
    .lean()
    .exec();

  return records.map(toPublicTestCase);
};

const createTestCase = async (
  ownerId,
  specVersionId,
  input
) => {
  const specification = await getOwnedSpecification(
    ownerId,
    specVersionId
  );

  const existingCount = await TestCase.countDocuments({
    projectId: specification.projectId,
    specVersionId: specification._id,
  }).exec();

  if (
    existingCount >=
    MAX_TEST_CASES_PER_SPECIFICATION
  ) {
    throw createTestCaseLimitError();
  }

  const request = await validateForBaseline(
    ownerId,
    specification,
    input.operationKey,
    input.operationPath,
    input.request
  );

  const record = await TestCase.create({
    projectId: specification.projectId,
    specVersionId: specification._id,
    operationKey: input.operationKey,
    operationPath: input.operationPath,
    title: input.title,
    description: input.description ?? "",
    source: "MANUAL",
    status: "DRAFT",
    request,
    assertions: input.assertions,
  });

  return toPublicTestCase(record);
};

const getTestCase = async (
  ownerId,
  testCaseId
) => {
  const record = await getOwnedTestCaseRecord(
    ownerId,
    testCaseId
  );

  return toPublicTestCase(record);
};

const updateTestCase = async (
  ownerId,
  testCaseId,
  updates
) => {
  const current = await getOwnedTestCaseRecord(
    ownerId,
    testCaseId
  );

  if (current.status !== "DRAFT") {
    throw createConflictError(
      "Only draft test cases can be edited. Create a new draft to correct an approved or archived test case."
    );
  }

  const specification = await getOwnedSpecification(
    ownerId,
    current.specVersionId.toString()
  );

  const nextRequest = updates.request
    ? normalizeRequest(updates.request)
    : normalizeRequest(current.request);

  const validatedRequest = await validateForBaseline(
    ownerId,
    specification,
    current.operationKey,
    current.operationPath,
    nextRequest
  );

  const set = {
    ...(updates.title !== undefined
      ? { title: updates.title }
      : {}),
    ...(updates.description !== undefined
      ? { description: updates.description }
      : {}),
    ...(updates.request !== undefined
      ? { request: validatedRequest }
      : {}),
    ...(updates.assertions !== undefined
      ? { assertions: updates.assertions }
      : {}),
  };

  const updated = await TestCase.findOneAndUpdate(
    {
      _id: current._id,
      projectId: current.projectId,
      specVersionId: current.specVersionId,
      status: "DRAFT",
    },
    { $set: set },
    {
      returnDocument: "after",
      runValidators: true,
    }
  )
    .lean()
    .exec();

  if (!updated) {
    throw createConflictError(
      "The test case changed state while it was being edited. Reload it before continuing."
    );
  }

  return toPublicTestCase(updated);
};

const approveTestCase = async (
  ownerId,
  testCaseId
) => {
  const current = await getOwnedTestCaseRecord(
    ownerId,
    testCaseId
  );

  if (current.status !== "DRAFT") {
    throw createConflictError(
      "Only draft test cases can be approved."
    );
  }

  const specification = await getOwnedSpecification(
    ownerId,
    current.specVersionId.toString()
  );

  const request = await validateForBaseline(
    ownerId,
    specification,
    current.operationKey,
    current.operationPath,
    normalizeRequest(current.request)
  );

  const approvedAt = new Date();

  const updated = await TestCase.findOneAndUpdate(
    {
      _id: current._id,
      projectId: current.projectId,
      specVersionId: current.specVersionId,
      status: "DRAFT",
    },
    {
      $set: {
        request,
        status: "APPROVED",
        approvedAt,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  )
    .lean()
    .exec();

  if (!updated) {
    throw createConflictError(
      "The test case changed state before it could be approved. Reload it and try again."
    );
  }

  return toPublicTestCase(updated);
};

const archiveTestCase = async (
  ownerId,
  testCaseId
) => {
  const current = await getOwnedTestCaseRecord(
    ownerId,
    testCaseId
  );

  if (current.status === "ARCHIVED") {
    return toPublicTestCase(current);
  }

  const updated = await TestCase.findOneAndUpdate(
    {
      _id: current._id,
      projectId: current.projectId,
      specVersionId: current.specVersionId,
      status: {
        $in: ["DRAFT", "APPROVED"],
      },
    },
    {
      $set: {
        status: "ARCHIVED",
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  )
    .lean()
    .exec();

  if (!updated) {
    throw createConflictError(
      "The test case changed state before it could be archived. Reload it and try again."
    );
  }

  return toPublicTestCase(updated);
};

const testCaseService = {
  listTestCases,
  createTestCase,
  getTestCase,
  updateTestCase,
  approveTestCase,
  archiveTestCase,
};

export default testCaseService;