import { describe, expect, it } from "vitest";

import compareSchemas from
  "../src/services/schema-compatibility.service.js";

describe("Schema compatibility service", () => {
  it("should detect newly required request properties as breaking", () => {
    const result = compareSchemas(
      {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
      {
        type: "object",
        required: ["name", "id"],
        properties: {
          name: { type: "string" },
          id: { type: "string" },
        },
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_REQUIRED_ADDED",
          severity: "BREAKING",
          field: "schema.required.id",
        }),
      ])
    );
  });

  it("should classify optional request properties as non-breaking", () => {
    const result = compareSchemas(
      {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
      {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_PROPERTY_ADDED",
          field: "schema.properties.description",
          severity: "NON_BREAKING",
        }),
      ])
    );
  });

  it("should classify removal of an optional request property as potentially breaking when additional properties are allowed", () => {
    const result = compareSchemas(
      {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
      {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_PROPERTY_REMOVED",
          classification: "POTENTIALLY_BREAKING",
          severity: "INFO",
          field: "schema.properties.id",
        }),
      ])
    );
  });

  it("should detect removal of a response property as breaking", () => {
    const result = compareSchemas(
      {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
      {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
      {
        direction: "response",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_PROPERTY_REMOVED",
          severity: "BREAKING",
          field: "schema.properties.id",
        }),
      ])
    );
  });

  it("should detect removal of a request property when additional properties are prohibited", () => {
    const result = compareSchemas(
      {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        additionalProperties: false,
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_PROPERTY_REMOVED",
          severity: "BREAKING",
          field: "schema.properties.id",
        }),
      ])
    );
  });

  it("should detect newly required response properties as non-breaking", () => {
    const result = compareSchemas(
      {
        type: "object",
        properties: {
          id: { type: "string" },
        },
      },
      {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      {
        direction: "response",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_REQUIRED_ADDED",
          severity: "NON_BREAKING",
        }),
      ])
    );
  });

  it("should detect request enum narrowing as breaking", () => {
    const result = compareSchemas(
      {
        type: "string",
        enum: ["ACTIVE", "PENDING", "CANCELLED"],
      },
      {
        type: "string",
        enum: ["ACTIVE", "PENDING"],
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_ENUM_CHANGED",
          severity: "BREAKING",
        }),
      ])
    );
  });

  it("should detect response enum expansion as potentially breaking", () => {
    const result = compareSchemas(
      {
        type: "string",
        enum: ["ACTIVE", "PENDING"],
      },
      {
        type: "string",
        enum: ["ACTIVE", "PENDING", "CANCELLED"],
      },
      {
        direction: "response",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_ENUM_CHANGED",
          classification: "POTENTIALLY_BREAKING",
          severity: "INFO",
        }),
      ])
    );
  });

  it("should not report enum reordering as a change", () => {
    const result = compareSchemas(
      {
        type: "string",
        enum: ["ACTIVE", "PENDING", "CANCELLED"],
      },
      {
        type: "string",
        enum: ["CANCELLED", "ACTIVE", "PENDING"],
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual([]);
  });

  it("should recognize compatible request type expansion", () => {
    const result = compareSchemas(
      {
        type: "string",
      },
      {
        type: ["string", "null"],
      },
      {
        direction: "request",
      }
    );

    expect(
      result.changes.find(
        (change) => change.changeType === "SCHEMA_TYPE_CHANGED"
      )?.severity
    ).toBe("NON_BREAKING");
  });

  it("should classify response type expansion as potentially breaking", () => {
    const result = compareSchemas(
      {
        type: "string",
      },
      {
        type: ["string", "integer"],
      },
      {
        direction: "response",
      }
    );

    expect(
      result.changes.find(
        (change) => change.changeType === "SCHEMA_TYPE_CHANGED"
      )
    ).toMatchObject({
      classification: "POTENTIALLY_BREAKING",
      severity: "INFO",
    });
  });

  it("should detect a type added to a previously unrestricted request schema", () => {
    const result = compareSchemas(
      {},
      {
        type: "string",
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_TYPE_CHANGED",
          severity: "BREAKING",
        }),
      ])
    );
  });

  it("should detect request minimum constraint tightening", () => {
    const result = compareSchemas(
      {
        type: "integer",
        minimum: 0,
      },
      {
        type: "integer",
        minimum: 10,
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_CONSTRAINT_CHANGED",
          severity: "BREAKING",
        }),
      ])
    );
  });

  it("should classify response constraints that expand the output range as potentially breaking", () => {
    const result = compareSchemas(
      {
        type: "integer",
        minimum: 10,
      },
      {
        type: "integer",
        minimum: 0,
      },
      {
        direction: "response",
      }
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

  it("should detect a response property that is no longer guaranteed", () => {
    const result = compareSchemas(
      {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      {
        type: "object",
        properties: {
          id: { type: "string" },
        },
      },
      {
        direction: "response",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_REQUIRED_REMOVED",
          severity: "BREAKING",
        }),
      ])
    );
  });

  it("should recognize an expansion of additionalProperties for requests as non-breaking", () => {
    const result = compareSchemas(
      {
        type: "object",
        additionalProperties: false,
      },
      {
        type: "object",
        additionalProperties: true,
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_ADDITIONAL_PROPERTIES_CHANGED",
          severity: "NON_BREAKING",
        }),
      ])
    );
  });

  it("should recognize a restriction of additionalProperties for requests as breaking", () => {
    const result = compareSchemas(
      {
        type: "object",
        additionalProperties: true,
      },
      {
        type: "object",
        additionalProperties: false,
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_ADDITIONAL_PROPERTIES_CHANGED",
          severity: "BREAKING",
        }),
      ])
    );
  });

  it("should compare structurally identical additionalProperties schemas without a warning", () => {
    const result = compareSchemas(
      {
        type: "object",
        additionalProperties: {
          type: "string",
          minLength: 2,
        },
      },
      {
        type: "object",
        additionalProperties: {
          minLength: 2,
          type: "string",
        },
      },
      {
        direction: "request",
      }
    );

    expect(result.warnings).toEqual([]);
    expect(result.changes).toEqual([]);
  });

  it("should recursively compare changed additionalProperties schemas", () => {
    const result = compareSchemas(
      {
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      {
        type: "object",
        additionalProperties: {
          type: "string",
          minLength: 10,
        },
      },
      {
        direction: "request",
      }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_CONSTRAINT_CHANGED",
          severity: "BREAKING",
          field: "schema.additionalProperties.minLength",
        }),
      ])
    );
  });

  it("should flag changed composition for manual analysis", () => {
    const result = compareSchemas(
      {
        type: "object",
        allOf: [
          { type: "string" },
        ],
      },
      {
        type: "object",
        allOf: [
          { type: "integer" },
        ],
      }
    );

    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("should report changed JSON Schema patterns as uncertain", () => {
    const result = compareSchemas(
      {
        type: "string",
        pattern: "^[a-z]+$",
      },
      {
        type: "string",
        pattern: "^[A-Z]+$",
      }
    );

    expect(
      result.warnings.some(
        (warning) => warning.field.endsWith(".pattern")
      )
    ).toBe(true);
  });

  it("should compare nullable only for OpenAPI 3.0", () => {
    const baseline = {
      type: "string",
      nullable: false,
    };

    const candidate = {
      type: "string",
      nullable: true,
    };

    const version30 = compareSchemas(
      baseline,
      candidate,
      {
        direction: "request",
        openApiVersion: "3.0.3",
      }
    );

    expect(version30.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_NULLABILITY_CHANGED",
        }),
      ])
    );

    const version31 = compareSchemas(
      baseline,
      candidate,
      {
        direction: "request",
        openApiVersion: "3.1.0",
      }
    );

    expect(version31.changes).toEqual([]);
  });

  it("should validate comparison direction", () => {
    expect(() =>
      compareSchemas(
        {},
        {},
        {
          direction: "invalid",
        }
      )
    ).toThrow(
      "Schema comparison direction must be request or response."
    );
  });
});