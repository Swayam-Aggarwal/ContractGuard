import AppError from "../utils/appError.js";

const MAX_PARAMETER_ENTRIES = 20;
const MAX_PARAMETER_VALUE_LENGTH = 256;

const SUPPORTED_PARAMETER_SCHEMA_KEYS = new Set([
  "type",
  "enum",
  "const",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "default",
  "title",
  "description",
  "example",
  "deprecated",
  "nullable",
  "readOnly",
  "writeOnly",
]);

const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const toPlainRecord = (value) => {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }

  if (value && typeof value.toObject === "function") {
    return value.toObject({ flattenMaps: true });
  }

  return isRecord(value) ? { ...value } : {};
};

const createRequestError = (message, field = "request") =>
  new AppError(message, {
    statusCode: 422,
    code: "TEST_RUN_REQUEST_INVALID",
    details: [{ field, message }],
  });

const createUnsupportedInputError = (message, field = "request") =>
  new AppError(message, {
    statusCode: 422,
    code: "TEST_RUN_INPUT_UNSUPPORTED",
    details: [{ field, message }],
  });

const createCandidateIncompatibilityError = (error) =>
  new AppError(
    `The candidate operation cannot accept the baseline test inputs: ${error?.message ?? "parameter validation failed."}`,
    {
      statusCode: 409,
      code: "TEST_RUN_CANDIDATE_REQUEST_INCOMPATIBLE",
      details: Array.isArray(error?.details) ? error.details : [],
    }
  );

const parseInteger = (value, field) => {
  if (!/^-?(?:0|[1-9]\d*)$/u.test(value)) {
    throw createRequestError("This parameter must be an integer string.", field);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw createRequestError(
      "This integer parameter is outside the safe numeric range.",
      field
    );
  }

  return parsed;
};

const parseNumber = (value, field) => {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/iu.test(value)) {
    throw createRequestError("This parameter must be a finite number string.", field);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw createRequestError("This parameter must be a finite number.", field);
  }

  return parsed;
};

const parseScalarValue = (rawValue, parameter, field) => {
  if (typeof rawValue !== "string") {
    throw createRequestError("Parameter values must be strings.", field);
  }

  if (rawValue.length > MAX_PARAMETER_VALUE_LENGTH) {
    throw createRequestError(
      `Parameter values cannot exceed ${MAX_PARAMETER_VALUE_LENGTH} characters.`,
      field
    );
  }

  const schema = parameter?.schema;

  if (!isRecord(schema) || typeof schema.type !== "string") {
    throw createUnsupportedInputError(
      "Only parameters with a simple, explicitly declared scalar schema can be executed.",
      field
    );
  }

  if (
    Object.hasOwn(schema, "$ref") ||
    schema.type === "array" ||
    schema.type === "object"
  ) {
    throw createUnsupportedInputError(
      "Array, object, and referenced parameter schemas are not supported by this runner.",
      field
    );
  }

  if (schema.format !== undefined || schema.multipleOf !== undefined) {
    throw createUnsupportedInputError(
      "Formatted and multipleOf-constrained parameters are not supported by the initial runner.",
      field
    );
  }

  if (
    typeof schema.exclusiveMinimum === "boolean" ||
    typeof schema.exclusiveMaximum === "boolean"
  ) {
    throw createUnsupportedInputError(
      "OpenAPI 3.0 boolean exclusive-bound constraints are not supported by the initial runner.",
      field
    );
  }

  if (schema.pattern !== undefined) {
    throw createUnsupportedInputError(
      "Parameters with pattern-based validation are not supported by the initial runner.",
      field
    );
  }

  const unsupportedSchemaKeys = Object.keys(schema).filter(
    (key) => !SUPPORTED_PARAMETER_SCHEMA_KEYS.has(key)
  );

  if (unsupportedSchemaKeys.length > 0) {
    throw createUnsupportedInputError(
      `The parameter schema contains unsupported constraints: ${unsupportedSchemaKeys.slice(0, 5).join(", ")}.`,
      field
    );
  }

  let value;

  switch (schema.type) {
    case "string":
      value = rawValue;

      if (schema.minLength !== undefined && [...value].length < schema.minLength) {
        throw createRequestError(
          "The string parameter is shorter than its minimum length.",
          field
        );
      }

      if (schema.maxLength !== undefined && [...value].length > schema.maxLength) {
        throw createRequestError(
          "The string parameter exceeds its maximum length.",
          field
        );
      }
      break;

    case "integer":
      value = parseInteger(rawValue, field);
      break;

    case "number":
      value = parseNumber(rawValue, field);
      break;

    case "boolean":
      if (rawValue !== "true" && rawValue !== "false") {
        throw createRequestError(
          "Boolean parameters must be either 'true' or 'false'.",
          field
        );
      }

      value = rawValue === "true";
      break;

    default:
      throw createUnsupportedInputError(
        `The parameter type '${schema.type}' is not supported by this runner.`,
        field
      );
  }

  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((entry) => Object.is(entry, value))
  ) {
    throw createRequestError(
      "The parameter value is not included in the allowed enum values.",
      field
    );
  }

  if (
    Object.hasOwn(schema, "const") &&
    !Object.is(schema.const, value)
  ) {
    throw createRequestError(
      "The parameter value does not match the required constant.",
      field
    );
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      throw createRequestError("The parameter value is below its minimum.", field);
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      throw createRequestError("The parameter value exceeds its maximum.", field);
    }

    if (
      schema.exclusiveMinimum !== undefined &&
      value <= schema.exclusiveMinimum
    ) {
      throw createRequestError(
        "The parameter value must be greater than its exclusive minimum.",
        field
      );
    }

    if (
      schema.exclusiveMaximum !== undefined &&
      value >= schema.exclusiveMaximum
    ) {
      throw createRequestError(
        "The parameter value must be less than its exclusive maximum.",
        field
      );
    }
  }

  return value;
};

const validateOperationInput = (testCase, operation) => {
  if (
    !operation ||
    operation.kind !== "path" ||
    operation.method !== "GET" ||
    operation.path !== testCase.operationPath
  ) {
    throw createRequestError(
      "The test case does not match a supported GET path operation.",
      "operationKey"
    );
  }

  const rawPathParams = toPlainRecord(testCase.request?.pathParams);
  const rawQueryParams = toPlainRecord(testCase.request?.queryParams);

  const parameters = Array.isArray(operation.parameters)
    ? operation.parameters
    : [];

  const pathParameters = parameters.filter((entry) => entry?.in === "path");
  const queryParameters = parameters.filter((entry) => entry?.in === "query");

  const pathNames = new Set(pathParameters.map((entry) => entry.name));
  const queryNames = new Set(queryParameters.map((entry) => entry.name));

  if (
    Object.keys(rawPathParams).length +
    Object.keys(rawQueryParams).length >
    MAX_PARAMETER_ENTRIES
  ) {
    throw createRequestError(
      `At most ${MAX_PARAMETER_ENTRIES} combined path and query parameters are supported.`
    );
  }

  for (const name of Object.keys(rawPathParams)) {
    if (!pathNames.has(name)) {
      throw createRequestError(
        `Path parameter '${name}' is not declared by the operation.`,
        `request.pathParams.${name}`
      );
    }
  }

  for (const name of Object.keys(rawQueryParams)) {
    if (!queryNames.has(name)) {
      throw createRequestError(
        `Query parameter '${name}' is not declared by the operation.`,
        `request.queryParams.${name}`
      );
    }
  }

  const pathParams = {};
  const queryParams = {};

  for (const parameter of pathParameters) {
    const rawValue = rawPathParams[parameter.name];

    if (typeof rawValue !== "string" || rawValue.length === 0) {
      throw createRequestError(
        `A value is required for path parameter '${parameter.name}'.`,
        `request.pathParams.${parameter.name}`
      );
    }

    pathParams[parameter.name] = parseScalarValue(
      rawValue,
      parameter,
      `request.pathParams.${parameter.name}`
    );
  }

  for (const parameter of queryParameters) {
    const rawValue = rawQueryParams[parameter.name];

    if (rawValue === undefined) {
      if (parameter.required === true) {
        throw createRequestError(
          `A value is required for query parameter '${parameter.name}'.`,
          `request.queryParams.${parameter.name}`
        );
      }

      continue;
    }

    if (
      rawValue.length === 0 &&
      parameter.allowEmptyValue !== true
    ) {
      throw createRequestError(
        `Query parameter '${parameter.name}' does not allow an empty value.`,
        `request.queryParams.${parameter.name}`
      );
    }

    queryParams[parameter.name] = parseScalarValue(
      rawValue,
      parameter,
      `request.queryParams.${parameter.name}`
    );
  }

  return { pathParams, queryParams };
};

export const buildTestRunRequest = ({
  testCase,
  baselineOperation,
  candidateOperation,
}) => {
  const baselineInput = validateOperationInput(testCase, baselineOperation);

  let candidateInput;

  try {
    candidateInput = validateOperationInput(testCase, candidateOperation);
  } catch (error) {
    if (error?.code === "TEST_RUN_INPUT_UNSUPPORTED") {
      throw error;
    }

    throw createCandidateIncompatibilityError(error);
  }

  for (const [location, values] of [
    ["pathParams", baselineInput.pathParams],
    ["queryParams", baselineInput.queryParams],
  ]) {
    const candidateValues = candidateInput[location];

    for (const [name, value] of Object.entries(values)) {
      if (
        !Object.hasOwn(candidateValues, name) ||
        !Object.is(candidateValues[name], value)
      ) {
        throw createRequestError(
          `The candidate operation no longer accepts the baseline input '${name}' with the same scalar representation.`,
          `request.${location}.${name}`
        );
      }
    }
  }

  return {
    method: "GET",
    path: baselineOperation.path,
    pathParams: baselineInput.pathParams,
    queryParams: baselineInput.queryParams,
  };
};

export default { buildTestRunRequest };