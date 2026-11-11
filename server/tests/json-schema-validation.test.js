import { describe, expect, it } from "vitest";

import {
  validateOpenApiSchema,
  compileOpenApiSchema,
} from "../src/services/json-schema-validation.service.js";

describe("OpenAPI JSON Schema validation adapter", () => {
  it("validates a supported OpenAPI 3.0 nullable schema after normalization", () => {
    const schema = {
      type: "string",
      nullable: true,
    };

    const context = {
      openApiVersion: "3.0.3",
    };

    expect(
      validateOpenApiSchema(schema, "hello", context).valid
    ).toBe(true);

    expect(
      validateOpenApiSchema(schema, null, context).valid
    ).toBe(true);

    expect(
      validateOpenApiSchema(schema, 42, context).valid
    ).toBe(false);
  });

  it("validates standard JSON Schema 2020-12 object constraints", () => {
    const schema = {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
        name: {
          type: "string",
          minLength: 2,
        },
      },
      additionalProperties: false,
    };

    const context = {
      openApiVersion: "3.2.1",
    };

    expect(
      validateOpenApiSchema(
        schema,
        { id: 1, name: "AB" },
        context
      ).valid
    ).toBe(true);

    expect(
      validateOpenApiSchema(
        schema,
        { id: 0, name: "A" },
        context
      ).valid
    ).toBe(false);

    expect(
      validateOpenApiSchema(
        schema,
        { id: 1, extra: true },
        context
      ).valid
    ).toBe(false);
  });

  it("supports the OpenAPI 3.1 default dialect", () => {
    const compiled = compileOpenApiSchema(
      {
        type: "string",
        format: "date-time",
      },
      {
        openApiVersion: "3.1.2",
      }
    );

    expect(compiled.status).toBe("READY");

    expect(
      compiled.validate("2026-11-10T10:00:00Z").valid
    ).toBe(true);

    expect(
      compiled.validate("not-a-date").valid
    ).toBe(false);
  });

  it("returns UNSUPPORTED for an unrecognized custom dialect", () => {
    const compiled = compileOpenApiSchema(
      {
        type: "string",
      },
      {
        openApiVersion: "3.2.1",
        jsonSchemaDialect:
          "https://schemas.example.test/custom",
      }
    );

    expect(compiled.status).toBe("UNSUPPORTED");
    expect(compiled.validate).toBeNull();
  });

  it("resolves internal component-schema references without network access", () => {
    const document = {
      openapi: "3.2.1",
      info: {
        title: "Validation reference test",
        version: "1.0.0",
      },
      components: {
        schemas: {
          Product: {
            type: "object",
            required: ["id"],
            properties: {
              id: {
                type: "integer",
                minimum: 1,
              },
            },
            additionalProperties: false,
          },
        },
      },
    };

    const compiled = compileOpenApiSchema(
      {
        $ref: "#/components/schemas/Product",
      },
      {
        openApiVersion: document.openapi,
        document,
      }
    );

    expect(compiled.status).toBe("READY");
    expect(compiled.validate({ id: 1 }).valid).toBe(true);
    expect(compiled.validate({ id: 0 }).valid).toBe(false);

    expect(
      compiled.validate({ id: 1, extra: true }).valid
    ).toBe(false);
  });

  it("returns bounded validation diagnostics instead of exposing Ajv internals", () => {
    const result = validateOpenApiSchema(
      {
        type: "integer",
      },
      "not-an-integer",
      {
        openApiVersion: "3.2.1",
      }
    );

    expect(result.valid).toBe(false);

    expect(result.errors[0]).toMatchObject({
      keyword: "type",
      instancePath: "",
    });

    expect(result.errors[0]).not.toHaveProperty("parentSchema");
  });
});