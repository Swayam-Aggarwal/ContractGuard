import { describe, expect, it } from "vitest";

import compareSchemas from
  "../src/services/schema-compatibility.service.js";

import createOpenApiReferenceService from
  "../src/services/openapi-reference.service.js";

const createDocument = (openapi, schema, extras = {}) => ({
  openapi,
  info: {
    title: "Dialect Compatibility API",
    version: "1.0.0",
  },
  ...extras,
  components: {
    schemas: {
      Example: schema,
    },
  },
});

const getRegisteredSchema = (document) => {
  const references = createOpenApiReferenceService(document);

  return references.getValueAtPointer(
    "#/components/schemas/Example"
  ).value;
};

describe("Version-aware schema comparison", () => {
  it("compares OpenAPI 3.0 nullable true with the equivalent 3.1 null type", () => {
    const baselineDocument = createDocument("3.0.3", {
      type: "string",
      nullable: true,
    });

    const candidateDocument = createDocument("3.1.2", {
      type: ["string", "null"],
    });

    const result = compareSchemas(
      getRegisteredSchema(baselineDocument),
      getRegisteredSchema(candidateDocument),
      {
        direction: "response",
      }
    );

    expect(result.changes).toEqual([]);
  });

  it("does not treat a 3.0 non-nullable string as equivalent to a nullable 3.1 string", () => {
    const baselineDocument = createDocument("3.0.3", {
      type: "string",
      nullable: false,
    });

    const candidateDocument = createDocument("3.1.2", {
      type: ["string", "null"],
    });

    const result = compareSchemas(
      getRegisteredSchema(baselineDocument),
      getRegisteredSchema(candidateDocument),
      {
        direction: "response",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_TYPE_CHANGED",
          classification: "POTENTIALLY_BREAKING",
          severity: "INFO",
        }),
      ])
    );
  });

  it("preserves OpenAPI 3.0 nullable comparison across patch releases", () => {
    const baselineDocument = createDocument("3.0.3", {
      type: "string",
      nullable: false,
    });

    const candidateDocument = createDocument("3.0.4", {
      type: "string",
      nullable: true,
    });

    const result = compareSchemas(
      getRegisteredSchema(baselineDocument),
      getRegisteredSchema(candidateDocument),
      {
        direction: "response",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_NULLABILITY_CHANGED",
          classification: "POTENTIALLY_BREAKING",
          severity: "INFO",
        }),
      ])
    );
  });

  it("compares schemas under the same 3.2 dialect without legacy nullable semantics", () => {
    const baselineDocument = createDocument("3.2.1", {
      type: "string",
      nullable: false,
    });

    const candidateDocument = createDocument("3.2.1", {
      type: "string",
      nullable: true,
    });

    const result = compareSchemas(
      getRegisteredSchema(baselineDocument),
      getRegisteredSchema(candidateDocument),
      {
        direction: "response",
      }
    );

    expect(result.changes).toEqual([]);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "nullable is not an OpenAPI 3.1/3.2"
          ),
        }),
      ])
    );
  });
});