
import { describe, expect, it } from "vitest";

import createCompatibilityAnalysis from
  "../src/services/compatibility-analysis.service.js";

const createDocument = (paths = {}) => ({
  openapi: "3.2.1",

  info: {
    title: "ContractGuard Compatibility Test API",
    version: "1.0.0",
  },

  paths,
});

const createGetOperation = (overrides = {}) => ({
  operationId: "getProduct",

  responses: {
    "200": {
      description: "Product response.",
    },
  },

  ...overrides,
});

describe("Compatibility analysis service", () => {
  it("should report COMPLETE when specifications are identical", () => {
    const document = createDocument({
      "/products": {
        get: createGetOperation(),
      },
    });

    const result = createCompatibilityAnalysis(
      document,
      document
    );

    expect(result.analysisStatus).toBe("COMPLETE");
    expect(result.summary.totalChanges).toBe(0);
    expect(result.summary.breakingChanges).toBe(0);
    expect(result.summary.unchangedOperations).toBe(1);
    expect(result.changes).toEqual([]);
  });

  it("should identify removed operations as breaking", () => {
    const baseline = createDocument({
      "/products": {
        get: createGetOperation(),
      },
    });

    const candidate = createDocument({});

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.summary.removedOperations).toBe(1);

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "OPERATION_REMOVED",
          severity: "BREAKING",
          path: "/products",
          method: "GET",
        }),
      ])
    );
  });

  it("should identify added operations as non-breaking", () => {
    const baseline = createDocument({});

    const candidate = createDocument({
      "/products": {
        get: createGetOperation(),
      },
    });

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.summary.addedOperations).toBe(1);

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "OPERATION_ADDED",
          severity: "NON_BREAKING",
        }),
      ])
    );
  });

  it("should detect changes to operationId", () => {
    const baseline = createDocument({
      "/products": {
        get: createGetOperation({
          operationId: "getProduct",
        }),
      },
    });

    const candidate = createDocument({
      "/products": {
        get: createGetOperation({
          operationId: "fetchProduct",
        }),
      },
    });

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "OPERATION_ID_CHANGED",
          severity: "BREAKING",
          oldValue: "getProduct",
          newValue: "fetchProduct",
        }),
      ])
    );
  });

  it("should detect a newly required query parameter", () => {
    const baseline = createDocument({
      "/products": {
        get: createGetOperation({
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: {
                type: "integer",
              },
            },
          ],
        }),
      },
    });

    const candidate = createDocument({
      "/products": {
        get: createGetOperation({
          parameters: [
            {
              name: "limit",
              in: "query",
              required: true,
              schema: {
                type: "integer",
              },
            },
          ],
        }),
      },
    });

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "PARAMETER_REQUIRED",
          severity: "BREAKING",
        }),
      ])
    );
  });

  it("should detect a removed response code", () => {
    const baseline = createDocument({
      "/products": {
        get: createGetOperation({
          responses: {
            "200": {
              description: "Success.",
            },
            "404": {
              description: "Not found.",
            },
          },
        }),
      },
    });

    const candidate = createDocument({
      "/products": {
        get: createGetOperation({
          responses: {
            "200": {
              description: "Success.",
            },
          },
        }),
      },
    });

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "RESPONSE_REMOVED",
          severity: "BREAKING",
          field: "responses.404",
        }),
      ])
    );
  });

  it("should detect required fields added to request bodies", () => {
    const baseline = createDocument({
      "/products": {
        post: {
          operationId: "createProduct",

          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },

          responses: {
            "201": {
              description: "Created.",
            },
          },
        },
      },
    });

    const candidate = createDocument({
      "/products": {
        post: {
          operationId: "createProduct",

          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "price"],
                  properties: {
                    name: {
                      type: "string",
                    },
                    price: {
                      type: "number",
                    },
                  },
                },
              },
            },
          },

          responses: {
            "201": {
              description: "Created.",
            },
          },
        },
      },
    });

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_REQUIRED_ADDED",
          severity: "BREAKING",
        }),
      ])
    );
  });

  it("should report security changes as partial analysis", () => {
    const baseline = {
      ...createDocument({
        "/products": {
          get: createGetOperation(),
        },
      }),
      security: [],
    };

    const candidate = {
      ...createDocument({
        "/products": {
          get: createGetOperation(),
        },
      }),
      security: [
        {
          bearerAuth: [],
        },
      ],
    };

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.analysisStatus).toBe("PARTIAL");

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "GET /products.security",
        }),
      ])
    );
  });

  it("should report deprecated operations as informational changes", () => {
    const baseline = createDocument({
      "/products": {
        get: createGetOperation({
          deprecated: false,
        }),
      },
    });

    const candidate = createDocument({
      "/products": {
        get: createGetOperation({
          deprecated: true,
        }),
      },
    });

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "OPERATION_DEPRECATED",
          severity: "INFO",
          breaking: false,
        }),
      ])
    );
  });
});
