
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  normalizeOpenApiSchema,
  registerOpenApiDocumentContext,
  SCHEMA_NORMALIZER_VERSION,
} from "./openapi-schema-normalization.service.js";

const SAFE_FORMATS = [
  "date",
  "time",
  "date-time",
  "ipv4",
  "ipv6",
  "uuid",
];

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const createAjv = () => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
    addUsedSchema: false,
    useDefaults: false,
    coerceTypes: false,
    removeAdditional: false,
    ownProperties: true,
    messages: true,
    verbose: false,
  });

  addFormats(ajv, SAFE_FORMATS);

  // These are OpenAPI-specific annotation keywords.
  // Standard JSON Schema keywords such as deprecated,
  // readOnly, and writeOnly are already handled by Ajv.
  const annotationKeywords = [
    { keyword: "discriminator", schemaType: "object", valid: true },
    { keyword: "xml", schemaType: "object", valid: true },
    { keyword: "externalDocs", schemaType: "object", valid: true },
    { keyword: "example", valid: true },
  ];

  for (const definition of annotationKeywords) {
    if (!ajv.getKeyword(definition.keyword)) {
      ajv.addKeyword(definition);
    }
  }

  for (const format of [
    "int32",
    "int64",
    "float",
    "double",
    "password",
  ]) {
    if (!ajv.formats?.[format]) {
      ajv.addFormat(format, () => true);
    }
  }

  return ajv;
};

const normalizeDocumentComponentSchemas = (document, context, warnings) => {
  const rawSchemas = document?.components?.schemas;

  if (!isRecord(rawSchemas)) return {};

  const schemas = {};

  for (const [name, schema] of Object.entries(rawSchemas)) {
    const normalized = normalizeOpenApiSchema(schema, {
      openApiVersion: context.openApiVersion,
      jsonSchemaDialect: context.jsonSchemaDialect,
      resourceRoot: true,
    });

    for (const warning of normalized.warnings) {
      warnings.push({
        ...warning,
        field: `components.schemas.${name}.${warning.field}`,
      });
    }

    if (!normalized.supported) {
      continue;
    }

    schemas[name] = normalized.validationSchema;
  }

  return schemas;
};

const toPublicErrors = (errors) => {
  if (!Array.isArray(errors)) return [];

  return errors.slice(0, 50).map((error) => ({
    keyword: String(error.keyword ?? "validation").slice(0, 100),
    instancePath: String(error.instancePath ?? "").slice(0, 1000),
    schemaPath: String(error.schemaPath ?? "").slice(0, 1000),
    message: String(
      error.message ?? "Schema validation failed."
    ).slice(0, 1000),
    params: isRecord(error.params) ? error.params : {},
  }));
};

const uniqueWarnings = (warnings) => [
  ...new Map(
    warnings.map((warning) => [
      `${warning.code ?? ""}\u0000${warning.field ?? ""}\u0000${warning.message ?? ""}`,
      warning,
    ])
  ).values(),
];

export const compileOpenApiSchema = (schema, context = {}) => {
  if (context.document) {
    registerOpenApiDocumentContext(context.document);
  }

  const openApiVersion =
    context.openApiVersion ??
    context.document?.openapi ??
    "3.0.3";

  const jsonSchemaDialect =
    context.jsonSchemaDialect ??
    context.document?.jsonSchemaDialect ??
    null;

  const normalized = normalizeOpenApiSchema(schema, {
    openApiVersion,
    jsonSchemaDialect,
    resourceRoot: context.resourceRoot ?? true,
  });

  if (!normalized.supported) {
    return {
      status: "UNSUPPORTED",
      dialect: normalized.dialect,
      normalizerVersion: SCHEMA_NORMALIZER_VERSION,
      warnings: normalized.warnings,
      validate: null,
    };
  }

  const warnings = [...normalized.warnings];

  let validationSchema = structuredClone(
    normalized.validationSchema
  );

  if (context.document) {
    const components = normalizeDocumentComponentSchemas(
      context.document,
      {
        openApiVersion,
        jsonSchemaDialect,
      },
      warnings
    );

    if (Object.keys(components).length > 0) {
      validationSchema = {
        ...validationSchema,
        components: {
          schemas: components,
        },
      };
    }
  }

  try {
    const ajv = createAjv();
    const validator = ajv.compile(validationSchema);

    const finalWarnings = uniqueWarnings(warnings);

    return {
      status: finalWarnings.length > 0 ? "PARTIAL" : "READY",
      dialect: normalized.dialect,
      normalizerVersion: SCHEMA_NORMALIZER_VERSION,
      warnings: finalWarnings,

      validate(data) {
        const valid = validator(data);

        return {
          valid: Boolean(valid),
          errors: valid ? [] : toPublicErrors(validator.errors),
        };
      },
    };
  } catch (error) {
    return {
      status: "UNSUPPORTED",
      dialect: normalized.dialect,
      normalizerVersion: SCHEMA_NORMALIZER_VERSION,
      warnings: uniqueWarnings([
        ...warnings,
        {
          code: "SCHEMA_COMPILATION_FAILED",
          field: "schema",
          message: String(
            error?.message ?? "The schema could not be compiled."
          ).slice(0, 1000),
          severity: "UNSUPPORTED",
        },
      ]),
      validate: null,
    };
  }
};

export const validateOpenApiSchema = (schema, data, context = {}) => {
  const compiled = compileOpenApiSchema(schema, context);

  if (typeof compiled.validate !== "function") {
    return {
      status: compiled.status,
      valid: null,
      errors: [],
      warnings: compiled.warnings,
      dialect: compiled.dialect,
    };
  }

  const result = compiled.validate(data);

  return {
    status: compiled.status,
    ...result,
    warnings: compiled.warnings,
    dialect: compiled.dialect,
  };
};

export default {
  compileOpenApiSchema,
  validateOpenApiSchema,
};
