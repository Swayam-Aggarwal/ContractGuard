import { describe, expect, it } from "vitest";

import {
  OPENAPI_31_DEFAULT_DIALECT,
  OPENAPI_32_DEFAULT_DIALECT,
  JSON_SCHEMA_2020_12_DIALECT,
  getSchemaDocumentContext,
  normalizeOpenApiSchema,
  registerOpenApiDocumentContext,
} from "../src/services/openapi-schema-normalization.service.js";

const document = (openapi, schema, extras = {}) => ({
  openapi,
  info: {
    title: "Dialect test",
    version: "1.0.0",
  },
  ...extras,
  components: {
    schemas: {
      Example: schema,
    },
  },
});

describe("OpenAPI schema dialect normalization", () => {
  it("uses the OpenAPI 3.0 subset for all 3.0 patch releases", () => {
    const value = {
      type: "string",
      nullable: true,
    };

    const context = registerOpenApiDocumentContext(
      document("3.0.4", value)
    );

    expect(context.openApiVersion).toBe("3.0.4");

    expect(getSchemaDocumentContext(value)).toMatchObject({
      openApiVersion: "3.0.4",
    });

    const result = normalizeOpenApiSchema(value);

    expect(result.supported).toBe(true);
    expect(result.family).toBe("OPENAPI_30");
    expect(result.dialect).toBe("OPENAPI_3_0_SCHEMA_SUBSET");
  });

  it("normalizes OpenAPI 3.0 nullable into a JSON Schema null type for validation", () => {
    const schema = {
      type: "string",
      nullable: true,
    };

    registerOpenApiDocumentContext(
      document("3.0.3", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.analysisSchema).toEqual({
      type: "string",
      nullable: true,
    });

    expect(result.validationSchema).toEqual({
      type: ["string", "null"],
    });
  });

  it("does not add null when OpenAPI 3.0 nullable has no explicit type", () => {
    const schema = {
      nullable: true,
      minimum: 1,
    };

    registerOpenApiDocumentContext(
      document("3.0.3", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.validationSchema).toEqual({
      minimum: 1,
    });
  });

  it("converts OpenAPI 3.0 exclusiveMinimum boolean semantics to 2020-12", () => {
    const schema = {
      type: "number",
      minimum: 10,
      exclusiveMinimum: true,
    };

    registerOpenApiDocumentContext(
      document("3.0.3", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.validationSchema).toMatchObject({
      type: "number",
      exclusiveMinimum: 10,
    });

    expect(result.validationSchema).not.toHaveProperty("minimum");
  });

  it("uses the OpenAPI 3.1 base dialect by default", () => {
    const schema = {
      type: "string",
    };

    registerOpenApiDocumentContext(
      document("3.1.2", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.supported).toBe(true);
    expect(result.dialect).toBe(OPENAPI_31_DEFAULT_DIALECT);
  });

  it("uses the current OpenAPI 3.2 dialect", () => {
    const schema = {
      type: "string",
    };

    registerOpenApiDocumentContext(
      document("3.2.1", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.supported).toBe(true);
    expect(result.dialect).toBe(OPENAPI_32_DEFAULT_DIALECT);
  });

  it("honors a document-level jsonSchemaDialect override", () => {
    const schema = {
      type: "string",
    };

    registerOpenApiDocumentContext(
      document("3.2.1", schema, {
        jsonSchemaDialect: JSON_SCHEMA_2020_12_DIALECT,
      })
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.supported).toBe(true);
    expect(result.dialect).toBe(JSON_SCHEMA_2020_12_DIALECT);
  });

  it("honors a schema-resource $schema override over the document default", () => {
    const schema = {
      $id: "https://example.test/schemas/item",
      $schema: JSON_SCHEMA_2020_12_DIALECT,
      type: "string",
    };

    registerOpenApiDocumentContext(
      document("3.2.1", schema, {
        jsonSchemaDialect: OPENAPI_32_DEFAULT_DIALECT,
      })
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.supported).toBe(true);
    expect(result.dialect).toBe(JSON_SCHEMA_2020_12_DIALECT);
  });

  it("marks unknown custom dialects unsupported instead of guessing", () => {
    const schema = {
      type: "string",
    };

    registerOpenApiDocumentContext(
      document("3.2.1", schema, {
        jsonSchemaDialect:
          "https://schemas.example.test/custom-dialect",
      })
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.supported).toBe(false);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CUSTOM_SCHEMA_DIALECT_UNSUPPORTED",
        }),
      ])
    );
  });

  it("normalizes schemas inside allOf arrays without shifting indexes", () => {
    const schema = {
      allOf: [
        {
          properties: {
            name: {
              type: "string",
              nullable: true,
            },
          },
        },
        {
          type: "object",
          properties: {
            id: {
              type: "integer",
            },
          },
        },
      ],
    };

    const before = structuredClone(schema);

    registerOpenApiDocumentContext(
      document("3.0.3", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(
      result.validationSchema.allOf[0].properties.name.type
    ).toEqual(["string", "null"]);

    expect(
      result.validationSchema.allOf[1].properties.id.type
    ).toBe("integer");

    expect(schema).toEqual(before);
  });

  it("normalizes schemas inside prefixItems arrays for OpenAPI 3.1", () => {
    const schema = {
      type: "array",
      prefixItems: [
        { type: "string" },
        { type: "integer" },
      ],
    };

    registerOpenApiDocumentContext(
      document("3.1.2", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.validationSchema.prefixItems).toEqual([
      { type: "string" },
      { type: "integer" },
    ]);
  });

  it("preserves schema properties whose names are OpenAPI annotation keywords", () => {
    const schema = {
      type: "object",
      properties: {
        nullable: { type: "string" },
        example: { type: "integer" },
        readOnly: { type: "boolean" },
      },
    };

    registerOpenApiDocumentContext(
      document("3.2.1", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.validationSchema.properties).toEqual({
      nullable: { type: "string" },
      example: { type: "integer" },
      readOnly: { type: "boolean" },
    });
  });

  it("marks an unknown nested resource dialect unsupported", () => {
    const schema = {
      type: "object",
      properties: {
        nested: {
          $schema: "https://schemas.example.test/unknown",
          type: "string",
        },
      },
    };

    registerOpenApiDocumentContext(
      document("3.2.1", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.supported).toBe(false);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SCHEMA_DIALECT_OVERRIDE_NOT_AT_RESOURCE_ROOT",
        }),
      ])
    );
  });

  it("marks formats outside the safe assertion profile as annotation-only", () => {
    const schema = {
      type: "string",
      format: "email",
    };

    registerOpenApiDocumentContext(
      document("3.2.1", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SCHEMA_FORMAT_ANNOTATION_ONLY",
        }),
      ])
    );
  });

  it("marks unsupported keywords in OpenAPI 3.0 as diagnostics", () => {
    const schema = {
      type: "string",
      const: "fixed",
    };

    registerOpenApiDocumentContext(
      document("3.0.3", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "OPENAPI_30_SCHEMA_KEYWORD_UNSUPPORTED",
        }),
      ])
    );
  });

  it("does not mutate nested schemas in the original uploaded document", () => {
    const schema = {
      type: "object",
      properties: {
        name: {
          type: "string",
          nullable: true,
        },
        price: {
          type: "number",
          minimum: 2,
          exclusiveMinimum: true,
        },
      },
    };

    const before = structuredClone(schema);

    registerOpenApiDocumentContext(
      document("3.0.3", schema)
    );

    const result = normalizeOpenApiSchema(schema);

    expect(result.validationSchema.properties.name.type).toEqual([
      "string",
      "null",
    ]);

    expect(
      result.validationSchema.properties.price.exclusiveMinimum
    ).toBe(2);

    expect(schema).toEqual(before);
  });
});