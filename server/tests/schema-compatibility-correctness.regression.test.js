import { describe, expect, it } from "vitest";

import compareSchemas from
  "../src/services/schema-compatibility.service.js";

import createOpenApiReferenceService from
  "../src/services/openapi-reference.service.js";

const createDocument = (openapi, schema) => ({
  openapi,
  info: {
    title: "Schema Correctness Regression API",
    version: "1.0.0",
  },
  paths: {},
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

const getChange = (result, changeType) =>
  result.changes.find((change) => change.changeType === changeType);

describe("Schema compatibility correctness regressions", () => {
  it("treats omitted OpenAPI 3.0 nullable as equivalent to nullable false", () => {
    const result = compareSchemas(
      { type: "string" },
      { type: "string", nullable: false },
      {
        direction: "response",
        openApiVersion: "3.0.3",
      }
    );

    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("classifies a new response property as potentially breaking when the baseline rejects additional properties", () => {
    const result = compareSchemas(
      {
        type: "object",
        additionalProperties: false,
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          price: { type: "number" },
        },
      },
      { direction: "response" }
    );

    expect(getChange(result, "SCHEMA_PROPERTY_ADDED")).toMatchObject({
      classification: "POTENTIALLY_BREAKING",
      severity: "INFO",
      field: "schema.properties.price",
    });

    expect(result.warnings).toEqual([]);
  });

  it("keeps a new response property non-breaking under the default open-object assumption", () => {
    const result = compareSchemas(
      { type: "object" },
      {
        type: "object",
        properties: {
          price: { type: "number" },
        },
      },
      { direction: "response" }
    );

    expect(getChange(result, "SCHEMA_PROPERTY_ADDED")).toMatchObject({
      classification: "NON_BREAKING",
      severity: "NON_BREAKING",
    });
  });

  it("does not treat a new request property as breaking when the baseline prohibited that property", () => {
    const result = compareSchemas(
      {
        type: "object",
        additionalProperties: false,
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          price: { type: "number" },
        },
      },
      { direction: "request" }
    );

    expect(getChange(result, "SCHEMA_PROPERTY_ADDED")).toMatchObject({
      classification: "NON_BREAKING",
      severity: "NON_BREAKING",
    });
  });

  it("compares a new request property against the baseline schema-valued additionalProperties rule", () => {
    const result = compareSchemas(
      {
        type: "object",
        additionalProperties: { type: "string" },
      },
      {
        type: "object",
        additionalProperties: { type: "string" },
        properties: {
          custom: { type: "number" },
        },
      },
      { direction: "request" }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_TYPE_CHANGED",
          classification: "BREAKING",
        }),
        expect.objectContaining({
          changeType: "SCHEMA_PROPERTY_ADDED",
          classification: "BREAKING",
        }),
      ])
    );
  });

  it("does not overstate a newly declared response property as definitely breaking when it conflicts with schema-valued additionalProperties", () => {
    const result = compareSchemas(
      {
        type: "object",
        additionalProperties: { type: "string" },
      },
      {
        type: "object",
        additionalProperties: { type: "string" },
        properties: {
          custom: { type: "number" },
        },
      },
      { direction: "response" }
    );

    expect(getChange(result, "SCHEMA_PROPERTY_ADDED")).toMatchObject({
      classification: "POTENTIALLY_BREAKING",
      severity: "INFO",
    });

    expect(result.changes.some((change) =>
      change.field.includes("baselineAdditionalProperties") &&
      change.classification === "BREAKING"
    )).toBe(false);
  });

  it("compares const and enum as one effective finite-value constraint", () => {
    const result = compareSchemas(
      {
        type: "string",
        const: "active",
      },
      {
        type: "string",
        enum: ["active", "inactive"],
      },
      { direction: "request" }
    );

    expect(result.changes).toHaveLength(1);

    expect(result.changes[0]).toMatchObject({
      changeType: "SCHEMA_ENUM_CHANGED",
      classification: "NON_BREAKING",
    });

    expect(result.warnings).toEqual([]);
  });

  it("classifies a response const-to-enum expansion as potentially breaking", () => {
    const result = compareSchemas(
      {
        type: "string",
        const: "active",
      },
      {
        type: "string",
        enum: ["active", "inactive"],
      },
      { direction: "response" }
    );

    expect(result.changes).toHaveLength(1);

    expect(result.changes[0]).toMatchObject({
      changeType: "SCHEMA_ENUM_CHANGED",
      classification: "POTENTIALLY_BREAKING",
      severity: "INFO",
    });
  });

  it("classifies broader response constraints as potentially breaking", () => {
    const result = compareSchemas(
      {
        type: "integer",
        minimum: 10,
      },
      {
        type: "integer",
        minimum: 0,
      },
      { direction: "response" }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_CONSTRAINT_CHANGED",
          classification: "POTENTIALLY_BREAKING",
          severity: "INFO",
        }),
      ])
    );
  });

  it("does not compare numeric-only constraints after a disjoint number-to-string change", () => {
    const result = compareSchemas(
      {
        type: "number",
        minimum: 0,
      },
      {
        type: "string",
      },
      { direction: "response" }
    );

    expect(result.changes).toHaveLength(1);

    expect(result.changes[0]).toMatchObject({
      changeType: "SCHEMA_TYPE_CHANGED",
      classification: "BREAKING",
    });

    expect(result.changes.some((change) =>
      change.changeType === "SCHEMA_CONSTRAINT_CHANGED" &&
      change.field.endsWith(".minimum")
    )).toBe(false);
  });

  it("preserves compatibility-relevant annotations in cross-dialect comparisons", () => {
    const baselineDocument = createDocument("3.0.3", {
      type: "string",
      nullable: true,
      readOnly: false,
    });

    const candidateDocument = createDocument("3.1.2", {
      type: ["string", "null"],
      readOnly: true,
    });

    const result = compareSchemas(
      getRegisteredSchema(baselineDocument),
      getRegisteredSchema(candidateDocument),
      { direction: "response" }
    );

    expect(result.changes).toEqual([]);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "schema.readOnly",
          message: expect.stringContaining("readOnly"),
        }),
      ])
    );
  });

  it("normalizes OpenAPI 3.0 nullable true to the equivalent OpenAPI 3.1 null type", () => {
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
      { direction: "response" }
    );

    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("classifies response nullability expansion across OpenAPI dialects as potentially breaking", () => {
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
      { direction: "response" }
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
});