import { isDeepStrictEqual } from "node:util";

import { compileOpenApiSchema } from "./json-schema-validation.service.js";

const MAX_DIAGNOSTICS = 50;
const MAX_MESSAGE_LENGTH = 1000;

const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const boundedText = (value, max = MAX_MESSAGE_LENGTH) =>
  String(value ?? "").slice(0, max);

const boundedAssertionValue = (value) => {
  if (typeof value === "string") return value.slice(0, 1000);

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  try {
    const serialized = JSON.stringify(value);

    if (Buffer.byteLength(serialized ?? "null", "utf8") <= 4096) {
      return value;
    }

    return `${String(serialized).slice(0, 1000)}… [truncated]`;
  } catch {
    return "[unavailable]";
  }
};

const getNestedValue = (value, dottedPath) => {
  const segments = dottedPath.split(".");
  let current = value;

  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) {
      return { found: false, value: undefined };
    }

    if (!Object.hasOwn(current, segment)) {
      return { found: false, value: undefined };
    }

    current = current[segment];
  }

  return { found: true, value: current };
};

const selectResponseDefinition = (operation, statusCode) => {
  const responses = operation?.resolvedResponses ?? {};

  const exact = responses[String(statusCode)];

  if (isRecord(exact)) return exact;

  const range = responses[`${Math.floor(statusCode / 100)}XX`];

  if (isRecord(range)) return range;

  const fallback = responses.default;

  return isRecord(fallback) ? fallback : null;
};

const selectJsonSchema = (response) => {
  if (!isRecord(response?.content)) return null;

  const exact = response.content["application/json"];

  if (isRecord(exact?.schema)) return exact.schema;

  for (const [mediaType, definition] of Object.entries(response.content)) {
    if (
      /^application\/(?:[^;]+\+)?json(?:\s*;|$)/iu.test(mediaType) &&
      isRecord(definition?.schema)
    ) {
      return definition.schema;
    }
  }

  return null;
};

const toBoundedParams = (value) => {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).slice(0, 20).map(([key, item]) => [
      boundedText(key, 100),
      item === null ||
      typeof item === "boolean" ||
      typeof item === "number"
        ? item
        : typeof item === "string"
          ? boundedText(item, 500)
          : Array.isArray(item)
            ? item.slice(0, 10).map((entry) => boundedText(entry, 200))
            : "[omitted]",
    ])
  );
};

const toDiagnostics = (entries = []) =>
  (Array.isArray(entries) ? entries : [])
    .slice(0, MAX_DIAGNOSTICS)
    .map((entry) => ({
      keyword: boundedText(entry.keyword, 100),
      instancePath: boundedText(entry.instancePath, 1000),
      schemaPath: boundedText(entry.schemaPath, 1000),
      message: boundedText(entry.message),
      params: toBoundedParams(entry.params),
    }));

const validateAgainstOperation = ({
  operation,
  document,
  statusCode,
  contentType,
  body,
}) => {
  const response = selectResponseDefinition(operation, statusCode);

  if (!response) {
    return {
      status: "UNSUPPORTED",
      valid: null,
      errors: [],
      warnings: [{
        keyword: "response",
        instancePath: "",
        schemaPath: "",
        message: `The operation does not define a response for HTTP ${statusCode}.`,
        params: {},
      }],
    };
  }

  const declaredMediaTypes = Object.keys(response.content ?? {});

  const actualMediaType = boundedText(contentType, 120)
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  const declaredJsonMediaTypes = declaredMediaTypes
    .filter((mediaType) => /^application\/(?:[^;]+\+)?json$/iu.test(mediaType))
    .map((mediaType) => mediaType.toLowerCase());

  if (
    declaredJsonMediaTypes.length > 0 &&
    !declaredJsonMediaTypes.includes(actualMediaType)
  ) {
    return {
      status: "READY",
      valid: false,
      errors: [{
        keyword: "contentType",
        instancePath: "",
        schemaPath: "",
        message: `The response returned '${actualMediaType || "no content type"}' instead of a declared JSON response media type.`,
        params: {
          allowed: declaredJsonMediaTypes.slice(0, 10),
        },
      }],
      warnings: [],
    };
  }

  const schema = selectJsonSchema(response);

  if (!schema) {
    return {
      status: "UNSUPPORTED",
      valid: null,
      errors: [],
      warnings: [{
        keyword: "content",
        instancePath: "",
        schemaPath: "",
        message: "The selected response does not define a supported JSON schema.",
        params: {},
      }],
    };
  }

  const compiled = compileOpenApiSchema(schema, {
    document,
    openApiVersion: document?.openapi,
    jsonSchemaDialect: document?.jsonSchemaDialect,
  });

  if (
    compiled.status !== "READY" ||
    typeof compiled.validate !== "function"
  ) {
    return {
      status: compiled.status,
      valid: null,
      errors: [],
      warnings: toDiagnostics(compiled.warnings),
    };
  }

  const validation = compiled.validate(body);

  return {
    status: "READY",
    valid: validation.valid,
    errors: toDiagnostics(validation.errors),
    warnings: toDiagnostics(compiled.warnings),
  };
};

const evaluateAssertions = ({
  assertions = {},
  statusCode,
  body,
}) => {
  const outcomes = [];

  if (assertions.expectedStatus !== undefined) {
    const passed = statusCode === assertions.expectedStatus;

    outcomes.push({
      kind: "EXPECTED_STATUS",
      path: null,
      passed,
      expected: assertions.expectedStatus,
      actual: statusCode,
      message: passed
        ? `Expected HTTP ${assertions.expectedStatus} was returned.`
        : `Expected HTTP ${assertions.expectedStatus}, but received HTTP ${statusCode}.`,
    });
  }

  for (const path of assertions.requiredProperties ?? []) {
    const actual = getNestedValue(body, path);

    outcomes.push({
      kind: "REQUIRED_PROPERTY",
      path,
      passed: actual.found,
      expected: "present",
      actual: actual.found ? "present" : "missing",
      message: actual.found
        ? `Required response property '${path}' is present.`
        : `Required response property '${path}' is missing.`,
    });
  }

  for (const assertion of assertions.propertyAssertions ?? []) {
    const actual = getNestedValue(body, assertion.path);

    if (assertion.type === "VALUE") {
      const passed =
        actual.found &&
        isDeepStrictEqual(actual.value, assertion.value);

      outcomes.push({
        kind: "VALUE",
        path: assertion.path,
        passed,
        expected: boundedAssertionValue(assertion.value),
        actual: actual.found
          ? boundedAssertionValue(actual.value)
          : null,
        message: passed
          ? `Response property '${assertion.path}' has the expected value.`
          : `Response property '${assertion.path}' does not have the expected value.`,
      });

      continue;
    }

    if (assertion.type === "PRESENCE") {
      const passed = actual.found === assertion.present;

      outcomes.push({
        kind: "PRESENCE",
        path: assertion.path,
        passed,
        expected: assertion.present ? "present" : "absent",
        actual: actual.found ? "present" : "absent",
        message: passed
          ? `Response property '${assertion.path}' has the expected presence state.`
          : `Response property '${assertion.path}' has an unexpected presence state.`,
      });
    }
  }

  return outcomes.map((outcome) => ({
    ...outcome,
    message: boundedText(outcome.message),
  }));
};

export const validateRegressionResponse = ({
  baselineOperation,
  candidateOperation,
  baselineDocument,
  candidateDocument,
  response,
  assertions,
}) => {
  const candidateSchemaValidation = validateAgainstOperation({
    operation: candidateOperation,
    document: candidateDocument,
    statusCode: response.statusCode,
    contentType: response.contentType,
    body: response.body,
  });

  const baselineSchemaValidation = validateAgainstOperation({
    operation: baselineOperation,
    document: baselineDocument,
    statusCode: response.statusCode,
    contentType: response.contentType,
    body: response.body,
  });

  const assertionOutcomes = evaluateAssertions({
    assertions,
    statusCode: response.statusCode,
    body: response.body,
  });

  const hasUnsupportedSchema =
    candidateSchemaValidation.status !== "READY" ||
    baselineSchemaValidation.status !== "READY";

  const schemaFailure =
    candidateSchemaValidation.valid === false ||
    baselineSchemaValidation.valid === false;

  const assertionFailure = assertionOutcomes.some(
    (outcome) => !outcome.passed
  );

  let status;

  if (schemaFailure || assertionFailure) {
    status = "FAILED";
  } else if (hasUnsupportedSchema) {
    status = "UNSUPPORTED";
  } else {
    status = "PASSED";
  }

  return {
    status,
    candidateSchemaValidation,
    baselineSchemaValidation,
    assertions: assertionOutcomes,
  };
};

export default { validateRegressionResponse };