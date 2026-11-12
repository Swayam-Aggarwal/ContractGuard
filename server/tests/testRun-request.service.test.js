import { describe, expect, it } from "vitest";

import {
  buildTestRunRequest,
} from "../src/services/testRun-request.service.js";

const listOperation = (maximum = 50) => ({
  kind: "path",
  method: "GET",
  path: "/products",
  parameters: [
    {
      name: "limit",
      in: "query",
      required: false,
      schema: {
        type: "integer",
        minimum: 1,
        maximum,
      },
    },
  ],
});

const productOperation = () => ({
  kind: "path",
  method: "GET",
  path: "/products/{productId}",
  parameters: [
    {
      name: "productId",
      in: "path",
      required: true,
      schema: {
        type: "string",
        minLength: 1,
      },
    },
  ],
});

describe("test-run request builder", () => {
  it("converts declared scalar query parameters to OpenAPI types", () => {
    const result = buildTestRunRequest({
      testCase: {
        operationPath: "/products",
        request: {
          pathParams: {},
          queryParams: { limit: "10" },
        },
      },
      baselineOperation: listOperation(50),
      candidateOperation: listOperation(100),
    });

    expect(result).toEqual({
      method: "GET",
      path: "/products",
      pathParams: {},
      queryParams: { limit: 10 },
    });
  });

  it("converts path parameters without constructing a URL", () => {
    const result = buildTestRunRequest({
      testCase: {
        operationPath: "/products/{productId}",
        request: {
          pathParams: { productId: "1001" },
          queryParams: {},
        },
      },
      baselineOperation: productOperation(),
      candidateOperation: productOperation(),
    });

    expect(result.path).toBe("/products/{productId}");
    expect(result.pathParams).toEqual({
      productId: "1001",
    });
  });

  it("rejects values outside baseline or candidate schema constraints", () => {
    expect(() =>
      buildTestRunRequest({
        testCase: {
          operationPath: "/products",
          request: {
            pathParams: {},
            queryParams: { limit: "0" },
          },
        },
        baselineOperation: listOperation(50),
        candidateOperation: listOperation(100),
      })
    ).toThrow(/minimum/u);
  });

  it("rejects undeclared query parameters", () => {
    expect(() =>
      buildTestRunRequest({
        testCase: {
          operationPath: "/products",
          request: {
            pathParams: {},
            queryParams: { target: "http://example.com" },
          },
        },
        baselineOperation: listOperation(),
        candidateOperation: listOperation(100),
      })
    ).toThrow(/not declared/u);
  });

  it("does not execute parameters requiring arbitrary regular-expression evaluation", () => {
    const patternedOperation = {
      ...productOperation(),
      parameters: [{
        name: "productId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          pattern: "^(a+)+$",
        },
      }],
    };

    expect(() =>
      buildTestRunRequest({
        testCase: {
          operationPath: "/products/{productId}",
          request: {
            pathParams: { productId: "aaaa" },
            queryParams: {},
          },
        },
        baselineOperation: patternedOperation,
        candidateOperation: patternedOperation,
      })
    ).toThrow(/pattern-based/u);
  });

  it("fails a regression when the candidate introduces a new required query parameter", () => {
    const baseline = listOperation(50);

    const candidate = {
      ...listOperation(100),
      parameters: [
        ...listOperation(100).parameters,
        {
          name: "region",
          in: "query",
          required: true,
          schema: { type: "string" },
        },
      ],
    };

    expect(() =>
      buildTestRunRequest({
        testCase: {
          operationPath: "/products",
          request: {
            pathParams: {},
            queryParams: { limit: "10" },
          },
        },
        baselineOperation: baseline,
        candidateOperation: candidate,
      })
    ).toThrow(
      expect.objectContaining({
        code: "TEST_RUN_CANDIDATE_REQUEST_INCOMPATIBLE",
        statusCode: 409,
      })
    );
  });

  it("rejects OpenAPI 3.0 boolean exclusive bounds rather than misinterpreting them", () => {
    const boundedOperation = {
      ...listOperation(50),
      parameters: [{
        name: "limit",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 5,
          exclusiveMinimum: true,
        },
      }],
    };

    expect(() =>
      buildTestRunRequest({
        testCase: {
          operationPath: "/products",
          request: {
            pathParams: {},
            queryParams: { limit: "3" },
          },
        },
        baselineOperation: boundedOperation,
        candidateOperation: boundedOperation,
      })
    ).toThrow(/boolean exclusive-bound/u);
  });

  it("enforces scalar const constraints", () => {
    const constantOperation = {
      kind: "path",
      method: "GET",
      path: "/products/{productId}",
      parameters: [{
        name: "productId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          const: "1001",
        },
      }],
    };

    expect(() =>
      buildTestRunRequest({
        testCase: {
          operationPath: "/products/{productId}",
          request: {
            pathParams: { productId: "1002" },
            queryParams: {},
          },
        },
        baselineOperation: constantOperation,
        candidateOperation: constantOperation,
      })
    ).toThrow(/constant/u);
  });

  it("rejects formats that the bounded request builder does not validate", () => {
    const formattedOperation = {
      ...productOperation(),
      parameters: [{
        name: "productId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          format: "uuid",
        },
      }],
    };

    expect(() =>
      buildTestRunRequest({
        testCase: {
          operationPath: "/products/{productId}",
          request: {
            pathParams: { productId: "1001" },
            queryParams: {},
          },
        },
        baselineOperation: formattedOperation,
        candidateOperation: formattedOperation,
      })
    ).toThrow(/Formatted and multipleOf-constrained/u);
  });
});