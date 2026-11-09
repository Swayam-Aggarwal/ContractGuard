
import { describe, expect, it } from "vitest";

import compareSchemas from "../src/services/schema-compatibility.service.js";
import createCompatibilityAnalysis from "../src/services/compatibility-analysis.service.js";

const document = (operation) => ({
  openapi: "3.2.1",
  info: {
    title: "Regression API",
    version: "1.0.0",
  },
  paths: {
    "/items": {
      get: operation,
    },
  },
});

const operation = (overrides = {}) => ({
  responses: {
    "200": {
      description: "OK",
    },
  },
  ...overrides,
});

describe("Compatibility analyzer regressions", () => {
  it("detects a newly added request minimum constraint", () => {
    const result = compareSchemas(
      { type: "string" },
      { type: "string", minLength: 10 },
      { direction: "request" }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_CONSTRAINT_CHANGED",
          severity: "BREAKING",
          field: "schema.minLength",
        }),
      ])
    );
  });

  it("detects an enum added to a previously unrestricted request schema", () => {
    const result = compareSchemas(
      { type: "string" },
      { type: "string", enum: ["a", "b"] },
      { direction: "request" }
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

  it("does not report enum ordering as a semantic change", () => {
    const result = compareSchemas(
      { type: "string", enum: ["a", "b"] },
      { type: "string", enum: ["b", "a"] },
      { direction: "request" }
    );

    expect(result.changes).toEqual([]);
  });

  it("detects a type added to an unrestricted request schema", () => {
    const result = compareSchemas(
      {},
      { type: "string" },
      { direction: "request" }
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

  it("compares boolean JSON Schemas", () => {
    const result = compareSchemas(
      true,
      false,
      { direction: "request" }
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_BOOLEAN_CHANGED",
          severity: "BREAKING",
        }),
      ])
    );
  });

  it("marks reports partial when stored parser diagnostics exist", () => {
    const spec = document(operation());

    const result = createCompatibilityAnalysis(spec, spec, {
      baselineWarnings: [
        {
          field: "paths",
          message: "Parser diagnostic",
        },
      ],
    });

    expect(result.analysisStatus).toBe("PARTIAL");

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "baseline.parser.paths",
        }),
      ])
    );
  });

  it("does not classify a removed explicit response as breaking when a wildcard response covers it without review", () => {
    const baseline = document(
      operation({
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not found" },
        },
      })
    );

    const candidate = document(
      operation({
        responses: {
          "200": { description: "OK" },
          "4XX": { description: "Client error" },
        },
      })
    );

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "RESPONSE_STATUS_COVERAGE_CHANGED",
          severity: "INFO",
        }),
      ])
    );

    expect(result.analysisStatus).toBe("PARTIAL");
  });

  it("uses OAS 3.0 Schema Object reference semantics", () => {
    const baseline = document(
      operation({
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Name",
                minLength: 2,
              },
            },
          },
        },
      })
    );

    baseline.openapi = "3.0.4";

    baseline.components = {
      schemas: {
        Name: {
          type: "string",
        },
      },
    };

    const candidate = structuredClone(baseline);

    candidate.paths["/items"].get.requestBody.content[
      "application/json"
    ].schema.minLength = 20;

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(
      result.changes.filter(
        (change) => change.category === "schema"
      )
    ).toEqual([]);

    expect(result.analysisStatus).toBe("COMPLETE");
  });

  it("marks changed OAS 3.1 schema $ref siblings as partial", () => {
    const baseline = document(
      operation({
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Name",
                minLength: 2,
              },
            },
          },
        },
      })
    );

    baseline.components = {
      schemas: {
        Name: {
          type: "string",
        },
      },
    };

    const candidate = structuredClone(baseline);

    candidate.paths["/items"].get.requestBody.content[
      "application/json"
    ].schema.minLength = 20;

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.analysisStatus).toBe("PARTIAL");
  });

  it("normalizes equivalent parameter serialization defaults", () => {
    const baseline = document(
      operation({
        parameters: [
          {
            name: "q",
            in: "query",
            schema: {
              type: "string",
            },
          },
        ],
      })
    );

    const candidate = document(
      operation({
        parameters: [
          {
            name: "q",
            in: "query",
            style: "form",
            explode: true,
            allowReserved: false,
            allowEmptyValue: false,
            required: false,
            schema: {
              type: "string",
            },
          },
        ],
      })
    );

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(
      result.changes.filter(
        (change) => change.category === "parameter"
      )
    ).toEqual([]);
  });

  it("detects allowEmptyValue changes", () => {
    const baseline = document(
      operation({
        parameters: [
          {
            name: "q",
            in: "query",
            allowEmptyValue: false,
            schema: {
              type: "string",
            },
          },
        ],
      })
    );

    const candidate = document(
      operation({
        parameters: [
          {
            name: "q",
            in: "query",
            allowEmptyValue: true,
            schema: {
              type: "string",
            },
          },
        ],
      })
    );

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "PARAMETER_SERIALIZATION_CHANGED",
          severity: "BREAKING",
          field: "parameters.query.q.allowEmptyValue",
        }),
      ])
    );
  });

  it("detects a schema added to a previously unconstrained request media type", () => {
    const baseline = document(
      operation({
        requestBody: {
          content: {
            "application/json": {},
          },
        },
      })
    );

    const candidate = document(
      operation({
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["id"],
                properties: {
                  id: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
      })
    );

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "MEDIA_TYPE_SCHEMA_ADDED",
          severity: "BREAKING",
          field: "requestBody.content.application/json.schema",
        }),
      ])
    );
  });

  it("detects a response schema removed from a media type", () => {
    const baseline = document(
      operation({
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        },
      })
    );

    const candidate = document(
      operation({
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {},
            },
          },
        },
      })
    );

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "MEDIA_TYPE_SCHEMA_REMOVED",
          severity: "BREAKING",
          field: "responses.200.content.application/json.schema",
        }),
      ])
    );
  });

  it("marks media type encoding changes as partial", () => {
    const baseline = document(
      operation({
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
              },
              encoding: {
                file: {
                  contentType: "image/png",
                },
              },
            },
          },
        },
      })
    );

    const candidate = document(
      operation({
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
              },
              encoding: {
                file: {
                  contentType: "application/octet-stream",
                },
              },
            },
          },
        },
      })
    );

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.analysisStatus).toBe("PARTIAL");

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field:
            "requestBody.content.multipart/form-data.encoding",
        }),
      ])
    );
  });

  it("flags security scheme definition changes for manual review", () => {
    const baseline = document(
      operation({
        security: [
          {
            bearerAuth: [],
          },
        ],
      })
    );

    baseline.components = {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    };

    const candidate = document(
      operation({
        security: [
          {
            bearerAuth: [],
          },
        ],
      })
    );

    candidate.components = {
      securitySchemes: {
        bearerAuth: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
        },
      },
    };

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SECURITY_SCHEME_CHANGED",
          severity: "INFO",
        }),
      ])
    );

    expect(result.analysisStatus).toBe("PARTIAL");
  });

  it("does not apply arbitrary OpenAPI Reference Object siblings", () => {
    const baseline = document(
      operation({
        parameters: [
          {
            $ref: "#/components/parameters/ItemId",
            required: true,
          },
        ],
      })
    );

    baseline.components = {
      parameters: {
        ItemId: {
          name: "id",
          in: "query",
          required: false,
          schema: {
            type: "string",
          },
        },
      },
    };

    const candidate = document(
      operation({
        parameters: [
          {
            $ref: "#/components/parameters/ItemId",
          },
        ],
      })
    );

    candidate.components = structuredClone(
      baseline.components
    );

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(
      result.changes.filter(
        (change) => change.changeType === "PARAMETER_REQUIRED"
      )
    ).toEqual([]);
  });

  it("treats response header names case-insensitively", () => {
    const baseline = document(
      operation({
        responses: {
          "200": {
            description: "OK",
            headers: {
              ETag: {
                schema: {
                  type: "string",
                },
              },
            },
          },
        },
      })
    );

    const candidate = document(
      operation({
        responses: {
          "200": {
            description: "OK",
            headers: {
              etag: {
                schema: {
                  type: "string",
                },
              },
            },
          },
        },
      })
    );

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(
      result.changes.filter((change) =>
        change.changeType.startsWith("RESPONSE_HEADER_")
      )
    ).toEqual([]);
  });
});
