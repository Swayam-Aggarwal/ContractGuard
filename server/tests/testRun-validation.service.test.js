import { describe, expect, it } from "vitest";

import {
  validateRegressionResponse,
} from "../src/services/testRun-validation.service.js";

const baselineDocument = {
  openapi: "3.0.3",
  components: {
    schemas: {
      Product: {
        type: "object",
        required: [
          "id",
          "name",
          "description",
          "price",
          "currency",
          "stock",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "number" },
          currency: { type: "string" },
          stock: { type: "integer" },
        },
      },
    },
  },
};

const candidateDocument = {
  openapi: "3.0.3",
  components: {
    schemas: {
      Product: {
        type: "object",
        required: ["id", "name", "price", "currency"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          price: { type: "string" },
          currency: { type: "string" },
          categoryId: { type: "string" },
        },
      },
    },
  },
};

const operation = () => ({
  resolvedResponses: {
    "200": {
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/Product",
          },
        },
      },
    },
  },
});

describe("regression response validation", () => {
  it("passes candidate schema and detects a baseline contract regression", () => {
    const result = validateRegressionResponse({
      baselineOperation: operation(),
      candidateOperation: operation(),
      baselineDocument,
      candidateDocument,
      response: {
        statusCode: 200,
        contentType: "application/json",
        body: {
          id: "1001",
          name: "Mechanical Keyboard",
          price: "3499.00",
          currency: "INR",
          categoryId: "electronics",
        },
      },
      assertions: {
        expectedStatus: 200,
        requiredProperties: ["id", "name", "price"],
        propertyAssertions: [],
      },
    });

    expect(result.status).toBe("FAILED");

    expect(result.candidateSchemaValidation).toMatchObject({
      status: "READY",
      valid: true,
    });

    expect(result.baselineSchemaValidation).toMatchObject({
      status: "READY",
      valid: false,
    });

    expect(
      result.assertions.every((entry) => entry.passed)
    ).toBe(true);
  });

  it("passes when response satisfies both baseline and candidate schemas", () => {
    const compatibleDocument = {
      openapi: "3.0.3",
      components: {
        schemas: {
          Product: {
            type: "object",
            required: ["id", "name"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
            },
          },
        },
      },
    };

    const result = validateRegressionResponse({
      baselineOperation: operation(),
      candidateOperation: operation(),
      baselineDocument: compatibleDocument,
      candidateDocument: compatibleDocument,
      response: {
        statusCode: 200,
        contentType: "application/json",
        body: {
          id: "1",
          name: "Keyboard",
        },
      },
      assertions: {
        expectedStatus: 200,
        requiredProperties: ["id"],
        propertyAssertions: [
          {
            type: "VALUE",
            path: "name",
            value: "Keyboard",
          },
          {
            type: "PRESENCE",
            path: "missing",
            present: false,
          },
        ],
      },
    });

    expect(result.status).toBe("PASSED");
    expect(result.candidateSchemaValidation.valid).toBe(true);
    expect(result.baselineSchemaValidation.valid).toBe(true);
  });

  it("returns UNSUPPORTED when selected response has no JSON schema", () => {
    const noSchemaOperation = {
      resolvedResponses: {
        "200": {
          description: "No schema",
        },
      },
    };

    const result = validateRegressionResponse({
      baselineOperation: noSchemaOperation,
      candidateOperation: noSchemaOperation,
      baselineDocument: { openapi: "3.0.3" },
      candidateDocument: { openapi: "3.0.3" },
      response: {
        statusCode: 200,
        contentType: "application/json",
        body: {},
      },
      assertions: {},
    });

    expect(result.status).toBe("UNSUPPORTED");
  });

  it("evaluates required properties independently of schema validation", () => {
    const simpleDocument = { openapi: "3.0.3" };

    const simpleOperation = {
      resolvedResponses: {
        "200": {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "string" },
                },
              },
            },
          },
        },
      },
    };

    const result = validateRegressionResponse({
      baselineOperation: simpleOperation,
      candidateOperation: simpleOperation,
      baselineDocument: simpleDocument,
      candidateDocument: simpleDocument,
      response: {
        statusCode: 200,
        contentType: "application/json",
        body: {},
      },
      assertions: {
        requiredProperties: ["id"],
      },
    });

    expect(result.status).toBe("FAILED");
    expect(result.assertions[0].passed).toBe(false);
  });

  it("fails when candidate returns a media type not declared by its response", () => {
    const result = validateRegressionResponse({
      baselineOperation: operation(),
      candidateOperation: operation(),
      baselineDocument,
      candidateDocument,
      response: {
        statusCode: 200,
        contentType: "text/plain",
        body: {
          id: "1001",
          name: "Mechanical Keyboard",
        },
      },
      assertions: {},
    });

    expect(result.status).toBe("FAILED");

    expect(result.candidateSchemaValidation).toMatchObject({
      status: "READY",
      valid: false,
    });

    expect(
      result.candidateSchemaValidation.errors[0].keyword
    ).toBe("contentType");
  });
});