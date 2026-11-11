import compareSchemasCore from "./schema-compatibility-core.service.js";

import {
  getSchemaDocumentContext,
  normalizeOpenApiSchema,
} from "./openapi-schema-normalization.service.js";

const isSchemaValue = (value) =>
  typeof value === "boolean" ||
  (value !== null && typeof value === "object" && !Array.isArray(value));

const normalizeFallbackContext = (schema, options, side) => {
  const registered = getSchemaDocumentContext(schema);
  const prefix = side === "baseline" ? "baseline" : "candidate";

  return {
    openApiVersion:
      options[`${prefix}OpenApiVersion`] ??
      registered?.openApiVersion ??
      options.openApiVersion ??
      "3.2.1",

    jsonSchemaDialect:
      options[`${prefix}JsonSchemaDialect`] ??
      registered?.jsonSchemaDialect ??
      null,
  };
};

const isOpenApi30 = (version) => /^3\.0\./u.test(version ?? "");

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const transformSchemaChildren = (schema, transform) => {
  if (!isRecord(schema)) return schema;

  const output = structuredClone(schema);

  const transformMap = (keyword) => {
    if (!isRecord(output[keyword])) return;

    output[keyword] = Object.fromEntries(
      Object.entries(output[keyword]).map(([name, child]) => [
        name,
        transform(child),
      ])
    );
  };

  for (const keyword of [
    "properties",
    "patternProperties",
    "$defs",
    "definitions",
    "dependentSchemas",
  ]) {
    transformMap(keyword);
  }

  for (const keyword of [
    "items",
    "additionalProperties",
    "unevaluatedProperties",
    "unevaluatedItems",
    "propertyNames",
    "contains",
    "not",
    "if",
    "then",
    "else",
    "contentSchema",
  ]) {
    if (isSchemaValue(output[keyword])) {
      output[keyword] = transform(output[keyword]);
    }
  }

  for (const keyword of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
    if (Array.isArray(output[keyword])) {
      output[keyword] = output[keyword].map((child) =>
        isSchemaValue(child) ? transform(child) : child
      );
    }
  }

  return output;
};

// OpenAPI 3.0's nullable: true is equivalent to adding null to the declared
// type. Convert only the compatibility-analysis representation; never use
// the validation-only representation here because it intentionally strips
// annotations such as readOnly, writeOnly and discriminator.
const normalizeCrossDialectSchema = (schema, context) => {
  const normalized = normalizeOpenApiSchema(schema, context);

  if (!normalized.supported) {
    return normalized;
  }

  if (!isOpenApi30(context.openApiVersion)) {
    return {
      ...normalized,
      analysisSchema: normalized.analysisSchema,
    };
  }

  const convertNullable = (input) => {
    if (typeof input === "boolean" || !isRecord(input)) {
      return input;
    }

    const output = transformSchemaChildren(input, convertNullable);

    if (output.nullable === true && typeof output.type === "string") {
      output.type = [output.type, "null"];
    }

    // In OpenAPI 3.0 nullable has no effect without an explicit type.
    delete output.nullable;

    return output;
  };

  return {
    ...normalized,
    analysisSchema: convertNullable(normalized.analysisSchema),
  };
};

const createNormalizedReferenceResolver = (
  resolver,
  context,
  forceCrossDialectNormalization
) => {
  if (typeof resolver !== "function") return resolver;

  return (reference) => {
    const resolved = resolver(reference);

    const result = forceCrossDialectNormalization
      ? normalizeCrossDialectSchema(resolved, context)
      : normalizeOpenApiSchema(resolved, context);

    if (!result.supported) {
      throw new Error(
        `Referenced schema uses an unsupported dialect: ${result.warnings.map((item) => item.message).join("; ")}`
      );
    }

    return result.analysisSchema;
  };
};

const compareSchemas = (baseline, candidate, options = {}) => {
  if (!isSchemaValue(baseline)) {
    throw new TypeError("Baseline schema must be an object or boolean schema.");
  }

  if (!isSchemaValue(candidate)) {
    throw new TypeError("Candidate schema must be an object or boolean schema.");
  }

  const baselineContext = normalizeFallbackContext(
    baseline,
    options,
    "baseline"
  );

  const candidateContext = normalizeFallbackContext(
    candidate,
    options,
    "candidate"
  );

  const baselineNormalized = normalizeOpenApiSchema(
    baseline,
    baselineContext
  );

  const candidateNormalized = normalizeOpenApiSchema(
    candidate,
    candidateContext
  );

  const normalizationWarnings = [
    ...baselineNormalized.warnings.map((warning) => ({
      field: `baseline.${warning.field}`,
      message: warning.message,
    })),

    ...candidateNormalized.warnings.map((warning) => ({
      field: `candidate.${warning.field}`,
      message: warning.message,
    })),
  ];

  if (!baselineNormalized.supported || !candidateNormalized.supported) {
    return {
      changes: [],
      warnings: normalizationWarnings,
    };
  }

  const crossDialect =
    baselineNormalized.dialect !== candidateNormalized.dialect ||
    baselineNormalized.family !== candidateNormalized.family;

  const baselineSchema = crossDialect
    ? normalizeCrossDialectSchema(
        baseline,
        baselineContext
      ).analysisSchema
    : baselineNormalized.analysisSchema;

  const candidateSchema = crossDialect
    ? normalizeCrossDialectSchema(
        candidate,
        candidateContext
      ).analysisSchema
    : candidateNormalized.analysisSchema;

  const comparisonOpenApiVersion =
    !crossDialect && isOpenApi30(baselineContext.openApiVersion)
      ? "3.0.3"
      : "3.2.1";

  const result = compareSchemasCore(
    baselineSchema,
    candidateSchema,
    {
      ...options,

      openApiVersion: comparisonOpenApiVersion,

      resolveBaselineReference: createNormalizedReferenceResolver(
        options.resolveBaselineReference,
        baselineContext,
        crossDialect
      ),

      resolveCandidateReference: createNormalizedReferenceResolver(
        options.resolveCandidateReference,
        candidateContext,
        crossDialect
      ),
    }
  );

  return {
    changes: result.changes,
    warnings: [...normalizationWarnings, ...result.warnings],
  };
};

export default compareSchemas;