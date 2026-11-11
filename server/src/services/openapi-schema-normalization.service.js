const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const SCHEMA_DOCUMENT_CONTEXTS = new WeakMap();

export const OPENAPI_31_DEFAULT_DIALECT =
  "https://spec.openapis.org/oas/3.1/dialect/base";

export const OPENAPI_32_DEFAULT_DIALECT =
  "https://spec.openapis.org/oas/3.2/dialect/2026-08-30";

export const JSON_SCHEMA_2020_12_DIALECT =
  "https://json-schema.org/draft/2020-12/schema";

export const SCHEMA_NORMALIZER_VERSION = "1.0.0";

const OPENAPI_30_SCHEMA_KEYWORDS = new Set([
  "$ref",
  "title",
  "multipleOf",
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "maxItems",
  "minItems",
  "uniqueItems",
  "maxProperties",
  "minProperties",
  "required",
  "enum",
  "type",
  "allOf",
  "oneOf",
  "anyOf",
  "not",
  "items",
  "properties",
  "additionalProperties",
  "description",
  "format",
  "default",
  "nullable",
  "discriminator",
  "readOnly",
  "writeOnly",
  "xml",
  "externalDocs",
  "example",
  "deprecated",
]);

const JSON_SCHEMA_2020_12_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$anchor",
  "$dynamicAnchor",
  "$ref",
  "$dynamicRef",
  "$comment",
  "$defs",
  "definitions",
  "title",
  "description",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
  "examples",
  "type",
  "enum",
  "const",
  "multipleOf",
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "format",
  "contentEncoding",
  "contentMediaType",
  "contentSchema",
  "maxItems",
  "minItems",
  "uniqueItems",
  "prefixItems",
  "items",
  "contains",
  "minContains",
  "maxContains",
  "maxProperties",
  "minProperties",
  "required",
  "properties",
  "patternProperties",
  "additionalProperties",
  "propertyNames",
  "unevaluatedProperties",
  "unevaluatedItems",
  "dependentRequired",
  "dependentSchemas",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "$vocabulary",
]);

const OPENAPI_ANNOTATION_KEYWORDS = new Set([
  "discriminator",
  "xml",
  "externalDocs",
  "example",
  "deprecated",
  "readOnly",
  "writeOnly",
]);

const SAFE_FORMATS = new Set([
  "date",
  "time",
  "date-time",
  "ipv4",
  "ipv6",
  "uuid",
]);

const ANNOTATION_ONLY_FORMATS = new Set([
  "int32",
  "int64",
  "float",
  "double",
  "password",
]);

const normalizeVersion = (version) => {
  if (typeof version !== "string") return null;

  const match = /^3\.(0|1|2)\.(\d+)$/u.exec(version);

  if (!match) return null;

  return {
    major: 3,
    minor: Number(match[1]),
    patch: Number(match[2]),
    featureSet: `3.${match[1]}`,
  };
};

const normalizeDialectUri = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim().replace(/#$/u, "");
};

const diagnostic = (
  code,
  pointer,
  message,
  severity = "UNSUPPORTED"
) => ({
  code,
  field: pointer || "schema",
  message,
  severity,
});

export const registerOpenApiDocumentContext = (document) => {
  if (!isRecord(document)) {
    throw new TypeError("An OpenAPI document object is required.");
  }

  const context = Object.freeze({
    openApiVersion: document.openapi ?? null,
    jsonSchemaDialect: document.jsonSchemaDialect ?? null,
  });

  const visited = new WeakSet();
  const stack = [document];

  let visitedCount = 0;

  while (stack.length > 0) {
    const current = stack.pop();

    if (
      current === null ||
      typeof current !== "object" ||
      visited.has(current)
    ) {
      continue;
    }

    visited.add(current);
    SCHEMA_DOCUMENT_CONTEXTS.set(current, context);

    visitedCount += 1;

    if (visitedCount > 50000) {
      throw new RangeError(
        "OpenAPI document context registration exceeded 50,000 objects."
      );
    }

    for (const value of Object.values(current)) {
      if (value !== null && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return context;
};

export const getSchemaDocumentContext = (schema) => {
  if (schema === null || typeof schema !== "object") {
    return null;
  }

  return SCHEMA_DOCUMENT_CONTEXTS.get(schema) ?? null;
};

const resolveDialect = ({
  openApiVersion,
  jsonSchemaDialect,
  schema,
  isResourceRoot = true,
}) => {
  const version = normalizeVersion(openApiVersion);

  if (!version) {
    return {
      supported: false,
      dialect: null,
      family: "UNKNOWN",
      warning: diagnostic(
        "OPENAPI_SCHEMA_VERSION_UNSUPPORTED",
        "schema",
        `Schema normalization does not support OpenAPI version '${openApiVersion ?? "missing"}'.`
      ),
    };
  }

  if (version.minor === 0) {
    if (jsonSchemaDialect) {
      return {
        supported: false,
        dialect: null,
        family: "OPENAPI_30",
        warning: diagnostic(
          "OPENAPI_30_JSON_SCHEMA_DIALECT_UNSUPPORTED",
          "jsonSchemaDialect",
          "OpenAPI 3.0 does not define the jsonSchemaDialect field."
        ),
      };
    }

    if (schema && Object.hasOwn(schema, "$schema")) {
      return {
        supported: false,
        dialect: null,
        family: "OPENAPI_30",
        warning: diagnostic(
          "OPENAPI_30_SCHEMA_DIALECT_UNSUPPORTED",
          "$schema",
          "OpenAPI 3.0 Schema Objects do not support the JSON Schema $schema dialect override."
        ),
      };
    }

    return {
      supported: true,
      dialect: "OPENAPI_3_0_SCHEMA_SUBSET",
      family: "OPENAPI_30",
      version,
    };
  }

  const defaultDialect = version.minor === 1
    ? OPENAPI_31_DEFAULT_DIALECT
    : OPENAPI_32_DEFAULT_DIALECT;

  const hasRootOverride =
    schema !== null &&
    typeof schema === "object" &&
    Object.hasOwn(schema, "$schema");

  const rootOverride = hasRootOverride ? schema.$schema : null;

  if (
    hasRootOverride &&
    (typeof rootOverride !== "string" || rootOverride.trim() === "")
  ) {
    return {
      supported: false,
      dialect: null,
      family: version.minor === 1 ? "OPENAPI_31" : "OPENAPI_32",
      warning: diagnostic(
        "SCHEMA_DIALECT_OVERRIDE_INVALID",
        "$schema",
        "A schema dialect override must be a non-empty string."
      ),
    };
  }

  if (
    jsonSchemaDialect !== null &&
    jsonSchemaDialect !== undefined &&
    (
      typeof jsonSchemaDialect !== "string" ||
      jsonSchemaDialect.trim() === ""
    )
  ) {
    return {
      supported: false,
      dialect: null,
      family: version.minor === 1 ? "OPENAPI_31" : "OPENAPI_32",
      warning: diagnostic(
        "JSON_SCHEMA_DIALECT_INVALID",
        "jsonSchemaDialect",
        "jsonSchemaDialect must be a non-empty dialect URI string."
      ),
    };
  }

  if (rootOverride && !isResourceRoot) {
    return {
      supported: false,
      dialect: null,
      family: version.minor === 1 ? "OPENAPI_31" : "OPENAPI_32",
      warning: diagnostic(
        "SCHEMA_DIALECT_OVERRIDE_NOT_AT_RESOURCE_ROOT",
        "$schema",
        "A $schema override is only supported at a JSON Schema resource root; nested resources must declare $id."
      ),
    };
  }

  const dialect = normalizeDialectUri(
    rootOverride || jsonSchemaDialect || defaultDialect
  );

  const supportedDialects = new Set([
    JSON_SCHEMA_2020_12_DIALECT,
    OPENAPI_31_DEFAULT_DIALECT,
    OPENAPI_32_DEFAULT_DIALECT,
  ]);

  if (!supportedDialects.has(dialect)) {
    return {
      supported: false,
      dialect,
      family: version.minor === 1 ? "OPENAPI_31" : "OPENAPI_32",
      warning: diagnostic(
        "CUSTOM_SCHEMA_DIALECT_UNSUPPORTED",
        rootOverride ? "$schema" : "jsonSchemaDialect",
        `The schema dialect '${dialect ?? "missing"}' is not supported by this compatibility engine.`
      ),
    };
  }

  return {
    supported: true,
    dialect,
    family: version.minor === 1 ? "OPENAPI_31" : "OPENAPI_32",
    version,
  };
};

const isSchemaValue = (value) =>
  typeof value === "boolean" || isRecord(value);

const schemaChildEntries = (schema) => {
  const entries = [];

  for (const keyword of [
    "properties",
    "patternProperties",
    "$defs",
    "definitions",
    "dependentSchemas",
  ]) {
    if (isRecord(schema[keyword])) {
      for (const [name, child] of Object.entries(schema[keyword])) {
        entries.push({
          value: child,
          segments: [keyword, name],
          resourceRoot:
            isRecord(child) && typeof child.$id === "string",
        });
      }
    }
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
    const child = schema[keyword];

    if (isSchemaValue(child)) {
      entries.push({
        value: child,
        segments: [keyword],
        resourceRoot:
          isRecord(child) && typeof child.$id === "string",
      });
    }
  }

  for (const keyword of [
    "allOf",
    "anyOf",
    "oneOf",
    "prefixItems",
  ]) {
    if (Array.isArray(schema[keyword])) {
      schema[keyword].forEach((child, index) => {
        if (isSchemaValue(child)) {
          entries.push({
            value: child,
            segments: [keyword, index],
            resourceRoot:
              isRecord(child) && typeof child.$id === "string",
          });
        }
      });
    }
  }

  return entries;
};

const setNestedValue = (target, segments, value) => {
  let parent = target;

  for (const segment of segments.slice(0, -1)) {
    parent = parent[segment];
  }

  const last = segments.at(-1);

  if (Array.isArray(parent)) {
    parent[Number(last)] = value;
  } else {
    parent[last] = value;
  }
};

const encodePointer = (segments) => {
  if (segments.length === 0) return "#";

  return `#/${segments.map((segment) =>
    String(segment)
      .replace(/~/g, "~0")
      .replace(/\//g, "~1")
  ).join("/")}`;
};

const isPotentiallyUnsafePattern = (pattern) => {
  if (typeof pattern !== "string") return false;
  if (pattern.length > 512) return true;

  return /\([^)]*[+*][^)]*\)[+*{]/u.test(pattern);
};

const normalizeSchemaTree = ({
  schema,
  context,
  pointerSegments,
  resourceRoot,
  warnings,
  depth,
}) => {
  const pointer = encodePointer(pointerSegments);

  if (depth > 100) {
    warnings.push(diagnostic(
      "SCHEMA_NORMALIZATION_DEPTH_EXCEEDED",
      pointer,
      "Schema normalization exceeded the maximum nesting depth of 100."
    ));

    return schema;
  }

  if (typeof schema === "boolean") {
    if (normalizeVersion(context.openApiVersion)?.minor === 0) {
      warnings.push(diagnostic(
        "BOOLEAN_SCHEMA_UNSUPPORTED_IN_OPENAPI_30",
        pointer,
        "Boolean schemas are not part of the supported OpenAPI 3.0 Schema Object subset."
      ));
    }

    return schema;
  }

  if (!isRecord(schema)) {
    warnings.push(diagnostic(
      "INVALID_SCHEMA_VALUE",
      pointer,
      "A Schema Object must be an object or a supported boolean schema."
    ));

    return schema;
  }

  const version = normalizeVersion(context.openApiVersion);

  const localDialect = resolveDialect({
    openApiVersion: context.openApiVersion,
    jsonSchemaDialect: context.jsonSchemaDialect,
    schema,
    isResourceRoot: resourceRoot,
  });

  if (!localDialect.supported) {
    warnings.push({
      ...localDialect.warning,
      field: pointer,
    });
  }

  const output = structuredClone(schema);

  for (const [key, value] of Object.entries(output)) {
    if (key === "nullable") {
      if (version?.minor === 0) {
        if (typeof value !== "boolean") {
          warnings.push(diagnostic(
            "OPENAPI_30_NULLABLE_INVALID",
            encodePointer([...pointerSegments, key]),
            "OpenAPI 3.0 nullable must be a boolean."
          ));
        } else {
          output[key] = value;
        }

        continue;
      }

      warnings.push(diagnostic(
        "LEGACY_NULLABLE_IN_MODERN_DIALECT",
        encodePointer([...pointerSegments, key]),
        "nullable is not an OpenAPI 3.1/3.2 JSON Schema keyword and is not interpreted as nullability."
      ));

      output[key] = value;
      continue;
    }

    if (
      version?.minor === 0 &&
      !OPENAPI_30_SCHEMA_KEYWORDS.has(key) &&
      !key.startsWith("x-")
    ) {
      warnings.push(diagnostic(
        "OPENAPI_30_SCHEMA_KEYWORD_UNSUPPORTED",
        encodePointer([...pointerSegments, key]),
        `The keyword '${key}' is outside the supported OpenAPI 3.0 Schema Object subset.`
      ));

      delete output[key];
      continue;
    }

    if (
      version?.minor !== 0 &&
      !JSON_SCHEMA_2020_12_KEYWORDS.has(key) &&
      !OPENAPI_ANNOTATION_KEYWORDS.has(key) &&
      !key.startsWith("x-")
    ) {
      warnings.push(diagnostic(
        "CUSTOM_SCHEMA_KEYWORD_UNSUPPORTED",
        encodePointer([...pointerSegments, key]),
        `The custom schema keyword '${key}' has no registered vocabulary implementation.`
      ));

      output[key] = value;
      continue;
    }

    if (key === "pattern" && isPotentiallyUnsafePattern(value)) {
      warnings.push(diagnostic(
        "SCHEMA_PATTERN_UNSAFE_OR_TOO_LARGE",
        encodePointer([...pointerSegments, key]),
        "The regular expression exceeds the safe pattern limits and will not be compiled by the validation adapter."
      ));
    }

    if (
      key === "format" &&
      typeof value === "string" &&
      !SAFE_FORMATS.has(value) &&
      !ANNOTATION_ONLY_FORMATS.has(value)
    ) {
      warnings.push(diagnostic(
        "SCHEMA_FORMAT_ANNOTATION_ONLY",
        encodePointer([...pointerSegments, key]),
        `The format '${value}' is not asserted by the configured safe validation profile; it remains an annotation.`
      ));
    }

    if (key === "$vocabulary" && isRecord(value)) {
      for (const [vocabulary, required] of Object.entries(value)) {
        const known =
          vocabulary.includes("json-schema.org/draft/2020-12") ||
          vocabulary.includes("spec.openapis.org/oas/");

        if (!known && required === true) {
          warnings.push(diagnostic(
            "REQUIRED_SCHEMA_VOCABULARY_UNSUPPORTED",
            encodePointer([...pointerSegments, key, vocabulary]),
            `The required JSON Schema vocabulary '${vocabulary}' is not supported.`
          ));
        }
      }
    }

    output[key] = value;
  }

  if (version?.minor === 0) {
    if (output.type !== undefined && Array.isArray(output.type)) {
      warnings.push(diagnostic(
        "OPENAPI_30_TYPE_ARRAY_UNSUPPORTED",
        encodePointer([...pointerSegments, "type"]),
        "OpenAPI 3.0 requires type to be a single string; type arrays belong to newer JSON Schema dialects."
      ));

      delete output.type;
    }

    for (const bound of ["Minimum", "Maximum"]) {
      const exclusiveKey = `exclusive${bound}`;
      const numericKey = bound.toLowerCase();
      const exclusiveValue = output[exclusiveKey];

      if (exclusiveValue === true) {
        if (typeof output[numericKey] === "number") {
          output[exclusiveKey] = output[numericKey];
          delete output[numericKey];
        } else {
          warnings.push(diagnostic(
            "OPENAPI_30_EXCLUSIVE_BOUND_WITHOUT_BOUND",
            encodePointer([...pointerSegments, exclusiveKey]),
            `${exclusiveKey}: true requires a numeric ${numericKey} value in OpenAPI 3.0.`
          ));

          delete output[exclusiveKey];
        }
      } else if (exclusiveValue === false) {
        delete output[exclusiveKey];
      } else if (
        exclusiveValue !== undefined &&
        typeof exclusiveValue !== "boolean"
      ) {
        warnings.push(diagnostic(
          "OPENAPI_30_EXCLUSIVE_BOUND_INVALID",
          encodePointer([...pointerSegments, exclusiveKey]),
          `${exclusiveKey} must be a boolean in OpenAPI 3.0.`
        ));

        delete output[exclusiveKey];
      }
    }

    if (Array.isArray(output.items)) {
      warnings.push(diagnostic(
        "OPENAPI_30_TUPLE_ITEMS_UNSUPPORTED",
        encodePointer([...pointerSegments, "items"]),
        "OpenAPI 3.0 items must be a Schema Object, not a tuple-validation array."
      ));

      delete output.items;
    }
  }

  for (const entry of schemaChildEntries(output)) {
    if (!isSchemaValue(entry.value)) continue;

    const child = normalizeSchemaTree({
      schema: entry.value,
      context,
      pointerSegments: [...pointerSegments, ...entry.segments],
      resourceRoot: entry.resourceRoot,
      warnings,
      depth: depth + 1,
    });

    setNestedValue(output, entry.segments, child);
  }

  return output;
};

const createValidationSchema = (
  schema,
  context,
  pointerSegments = [],
  depth = 0
) => {
  if (
    depth > 100 ||
    typeof schema === "boolean" ||
    !isRecord(schema)
  ) {
    return schema;
  }

  const result = structuredClone(schema);
  const version = normalizeVersion(context.openApiVersion);

  for (const key of Object.keys(result)) {
    if (
      key === "nullable" ||
      OPENAPI_ANNOTATION_KEYWORDS.has(key) ||
      key.startsWith("x-")
    ) {
      delete result[key];
      continue;
    }

    if (key === "$schema") {
      result.$schema = JSON_SCHEMA_2020_12_DIALECT;
      continue;
    }

    if (key === "pattern" && isPotentiallyUnsafePattern(result[key])) {
      delete result[key];
      continue;
    }

    if (
      version?.minor === 0 &&
      key === "type" &&
      typeof result.type === "string" &&
      schema.nullable === true
    ) {
      result.type = [result.type, "null"];
    }
  }

  for (const entry of schemaChildEntries(result)) {
    const child = createValidationSchema(
      entry.value,
      context,
      [...pointerSegments, ...entry.segments],
      depth + 1
    );

    setNestedValue(result, entry.segments, child);
  }

  return result;
};

export const normalizeOpenApiSchema = (
  schema,
  {
    openApiVersion,
    jsonSchemaDialect,
    resourceRoot = true,
  } = {}
) => {
  const registeredContext = getSchemaDocumentContext(schema);

  const context = {
    openApiVersion:
      openApiVersion ??
      registeredContext?.openApiVersion ??
      "3.0.3",

    jsonSchemaDialect:
      jsonSchemaDialect ??
      registeredContext?.jsonSchemaDialect ??
      null,
  };

  const warnings = [];

  const dialect = resolveDialect({
    openApiVersion: context.openApiVersion,
    jsonSchemaDialect: context.jsonSchemaDialect,
    schema,
    isResourceRoot: resourceRoot,
  });

  if (!dialect.supported) {
    warnings.push(dialect.warning);

    return {
      supported: false,
      dialect: dialect.dialect,
      family: dialect.family,
      normalizerVersion: SCHEMA_NORMALIZER_VERSION,
      analysisSchema: schema,
      validationSchema: null,
      warnings,
    };
  }

  const analysisSchema = normalizeSchemaTree({
    schema,
    context,
    pointerSegments: [],
    resourceRoot,
    warnings,
    depth: 0,
  });

  const validationWarnings = [];

  const validationBase = normalizeSchemaTree({
    schema,
    context,
    pointerSegments: [],
    resourceRoot,
    warnings: validationWarnings,
    depth: 0,
  });

  warnings.push(...validationWarnings);

  const validationSchema = createValidationSchema(
    validationBase,
    context
  );

  const uniqueWarnings = [
    ...new Map(
      warnings.map((warning) => [
        `${warning.code}\u0000${warning.field}\u0000${warning.message}`,
        warning,
      ])
    ).values(),
  ];

  const unsupportedNestedDialect = uniqueWarnings.some((warning) =>
    [
      "CUSTOM_SCHEMA_DIALECT_UNSUPPORTED",
      "SCHEMA_DIALECT_OVERRIDE_NOT_AT_RESOURCE_ROOT",
    ].includes(warning.code)
  );

  return {
    supported: !unsupportedNestedDialect,
    dialect: dialect.dialect,
    family: dialect.family,
    normalizerVersion: SCHEMA_NORMALIZER_VERSION,
    analysisSchema,
    validationSchema,
    warnings: uniqueWarnings,
  };
};

export const normalizeLegacySchemaForCrossDialectComparison = (
  schema,
  context
) => {
  const normalized = normalizeOpenApiSchema(schema, context);

  if (!normalized.supported) return normalized;

  return {
    ...normalized,
    analysisSchema: normalized.validationSchema,
  };
};

export default normalizeOpenApiSchema;