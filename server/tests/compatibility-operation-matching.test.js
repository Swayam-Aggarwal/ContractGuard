import { describe, expect, it } from "vitest";

import createCompatibilityAnalysis from
  "../src/services/compatibility-analysis.service.js";

import createOperationIndex from
  "../src/services/openapi-operation-index.service.js";

import {
  matchOpenApiOperations,
} from "../src/services/openapi-path-normalization.service.js";

const createDocument = (paths = {}) => ({
  openapi: "3.2.1",

  info: {
    title: "Operation Matching Test API",
    version: "1.0.0",
  },

  paths,
});

const pathParameter = (name) => ({
  name,
  in: "path",
  required: true,
  schema: {
    type: "string",
  },
});

const getOperation = (
  operationId,
  parameterName = "id",
  extra = {}
) => ({
  operationId,

  parameters: [
    pathParameter(parameterName),
  ],

  responses: {
    "200": {
      description: "Success.",
    },
  },

  ...extra,
});

const findChange = (result, ruleId) =>
  result.changes.find((change) => change.ruleId === ruleId);

describe("Canonical operation matching", () => {
  it("matches a path-parameter rename by canonical path and reports OP-004", () => {
    const baseline = createDocument({
      "/users/{id}": {
        get: getOperation("getUser", "id"),
      },
    });

    const candidate = createDocument({
      "/users/{userId}": {
        get: getOperation("getUser", "userId"),
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);
    const rename = findChange(result, "OP-004");

    expect(result.summary.removedOperations).toBe(0);
    expect(result.summary.addedOperations).toBe(0);

    expect(rename).toMatchObject({
      changeType: "PATH_PARAMETER_RENAMED",
      classification: "POTENTIALLY_BREAKING",
      oldValue: "id",
      newValue: "userId",
    });

    expect(
      result.changes.filter((change) =>
        [
          "OPERATION_REMOVED",
          "OPERATION_ADDED",
        ].includes(change.changeType)
      )
    ).toEqual([]);
  });

  it("matches multiple renamed path parameters by their positions", () => {
    const baseline = createDocument({
      "/users/{id}/orders/{orderId}": {
        get: {
          operationId: "getUserOrder",

          parameters: [
            pathParameter("id"),
            pathParameter("orderId"),
          ],

          responses: {
            "200": {
              description: "Order.",
            },
          },
        },
      },
    });

    const candidate = createDocument({
      "/users/{userId}/orders/{purchaseId}": {
        get: {
          operationId: "getUserOrder",

          parameters: [
            pathParameter("userId"),
            pathParameter("purchaseId"),
          ],

          responses: {
            "200": {
              description: "Order.",
            },
          },
        },
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    const renames = result.changes.filter(
      (change) => change.ruleId === "OP-004"
    );

    expect(renames).toHaveLength(2);

    expect(
      renames.map((change) => [
        change.oldValue,
        change.newValue,
      ])
    ).toEqual(
      expect.arrayContaining([
        ["id", "userId"],
        ["orderId", "purchaseId"],
      ])
    );

    expect(result.summary.removedOperations).toBe(0);
    expect(result.summary.addedOperations).toBe(0);
  });

  it("reports a parameter moved between locations as PAR-012 instead of removal plus addition", () => {
    const baseline = createDocument({
      "/items": {
        get: {
          parameters: [
            {
              name: "customerId",
              in: "query",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Success." },
          },
        },
      },
    });

    const candidate = createDocument({
      "/items": {
        get: {
          parameters: [
            {
              name: "customerId",
              in: "header",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Success." },
          },
        },
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(findChange(result, "PAR-012")).toMatchObject({
      changeType: "PARAMETER_LOCATION_CHANGED",
      classification: "BREAKING",
      oldValue: "query",
      newValue: "header",
    });

    expect(
      result.changes.filter((change) =>
        ["PARAMETER_REMOVED", "PARAMETER_ADDED"].includes(change.changeType)
      )
    ).toEqual([]);
  });

  it("does not collapse a concrete path into a templated path", () => {
    const baseline = createDocument({
      "/users/me": {
        get: {
          operationId: "getCurrentUser",

          responses: {
            "200": {
              description: "Current user.",
            },
          },
        },
      },
    });

    const candidate = createDocument({
      "/users/{id}": {
        get: getOperation("getUserById", "id"),
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(result.summary.removedOperations).toBe(1);
    expect(result.summary.addedOperations).toBe(1);
    expect(findChange(result, "OP-004")).toBeUndefined();
  });

  it("matches a static path change by a unique operationId and reports OP-003", () => {
    const baseline = createDocument({
      "/users/{id}": {
        get: getOperation("getUser", "id"),
      },
    });

    const candidate = createDocument({
      "/accounts/{id}": {
        get: getOperation("getUser", "id"),
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(findChange(result, "OP-003")).toMatchObject({
      changeType: "OPERATION_PATH_CHANGED",
      classification: "BREAKING",
      oldValue: "/users/{id}",
      newValue: "/accounts/{id}",
    });

    expect(result.summary.removedOperations).toBe(0);
    expect(result.summary.addedOperations).toBe(0);
  });

  it("matches a method change by a unique operationId and reports OP-008", () => {
    const baseline = createDocument({
      "/users/{id}": {
        get: getOperation("getUser", "id"),
      },
    });

    const candidate = createDocument({
      "/users/{id}": {
        post: {
          ...getOperation("getUser", "id"),

          requestBody: {
            required: false,

            content: {
              "application/json": {
                schema: {
                  type: "object",
                },
              },
            },
          },
        },
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(findChange(result, "OP-008")).toMatchObject({
      changeType: "OPERATION_METHOD_CHANGED",
      classification: "BREAKING",
      oldValue: "GET",
      newValue: "POST",
    });

    expect(result.summary.removedOperations).toBe(0);
    expect(result.summary.addedOperations).toBe(0);
  });

  it("matches a unique same-path method change when operationId is absent", () => {
    const baseline = createDocument({
      "/users/{id}": {
        get: getOperation(undefined, "id"),
      },
    });

    const candidate = createDocument({
      "/users/{id}": {
        post: {
          ...getOperation(undefined, "id"),
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(findChange(result, "OP-008")).toMatchObject({
      changeType: "OPERATION_METHOD_CHANGED",
      classification: "BREAKING",
      oldValue: "GET",
      newValue: "POST",
    });

    expect(result.summary.removedOperations).toBe(0);
    expect(result.summary.addedOperations).toBe(0);
  });

  it("does not guess a method change when multiple baseline operations share the same path", () => {
    const baseline = createDocument({
      "/users/{id}": {
        get: getOperation(undefined, "id"),
        post: getOperation(undefined, "id"),
      },
    });

    const candidate = createDocument({
      "/users/{id}": {
        put: getOperation(undefined, "id"),
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(result.analysisStatus).toBe("PARTIAL");
    expect(result.summary.removedOperations).toBe(0);
    expect(result.summary.addedOperations).toBe(0);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "cannot identify which operation changed its HTTP method"
          ),
        }),
      ])
    );
  });

  it("does not guess when the candidate has multiple methods on the same path", () => {
    const baseline = createDocument({
      "/users/{id}": {
        get: getOperation(undefined, "id"),
      },
    });

    const candidate = createDocument({
      "/users/{id}": {
        post: getOperation(undefined, "id"),
        put: getOperation(undefined, "id"),
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(result.analysisStatus).toBe("PARTIAL");
    expect(result.summary.removedOperations).toBe(0);
    expect(result.summary.addedOperations).toBe(0);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "cannot identify which operation changed its HTTP method"
          ),
        }),
      ])
    );
  });

  it("matches the same path when operationId changes and reports OP-005", () => {
    const baseline = createDocument({
      "/users/{id}": {
        get: getOperation("getUser", "id"),
      },
    });

    const candidate = createDocument({
      "/users/{id}": {
        get: getOperation("fetchUser", "id"),
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "OPERATION_ID_CHANGED",
          ruleId: "OP-005",
          classification: "POTENTIALLY_BREAKING",
          severity: "INFO",
          oldValue: "getUser",
          newValue: "fetchUser",
        }),
      ])
    );

    expect(result.summary.removedOperations).toBe(0);
    expect(result.summary.addedOperations).toBe(0);
  });

  it("does not match a changed path through a duplicated operationId", () => {
    const baseline = createDocument({
      "/users/{id}": {
        get: getOperation("getUser", "id"),
      },

      "/accounts/{id}": {
        get: getOperation("getUser", "id"),
      },
    });

    const candidate = createDocument({
      "/members/{id}": {
        get: getOperation("getUser", "id"),
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(result.analysisStatus).toBe("PARTIAL");

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("operationId 'getUser'"),
        }),
      ])
    );

    expect(result.summary.removedOperations).toBe(0);
    expect(result.summary.addedOperations).toBe(0);
  });

  it("does not create add/remove findings for duplicate canonical paths", () => {
    const baseline = createDocument({
      "/users/{id}": {
        get: getOperation("getUserById", "id"),
      },

      "/users/{name}": {
        get: getOperation("getUserByName", "name"),
      },
    });

    const candidate = createDocument({
      "/users/{userId}": {
        get: getOperation("getUser", "userId"),
      },
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(result.analysisStatus).toBe("PARTIAL");
    expect(result.summary.removedOperations).toBe(0);
    expect(result.summary.addedOperations).toBe(0);

    expect(
      result.changes.filter((change) =>
        [
          "OPERATION_REMOVED",
          "OPERATION_ADDED",
        ].includes(change.changeType)
      )
    ).toEqual([]);
  });

  it("matches callbacks under a parent whose path parameter was renamed", () => {
    const createCallbackOperation = (parameterName) => ({
      ...getOperation("createOrder", parameterName, {
        callbacks: {
          onStatus: {
            "{$request.body#/callbackUrl}": {
              post: {
                operationId: "receiveStatus",

                responses: {
                  "200": {
                    description: "Received.",
                  },
                },
              },
            },
          },
        },
      }),
    });

    const baseline = createDocument({
      "/orders/{id}": {
        post: createCallbackOperation("id"),
      },
    });

    const candidate = createDocument({
      "/orders/{orderId}": {
        post: createCallbackOperation("orderId"),
      },
    });

    const baselineOperations = createOperationIndex(baseline);
    const candidateOperations = createOperationIndex(candidate);

    const matches = matchOpenApiOperations(
      baselineOperations,
      candidateOperations
    );

    expect(matches.matches).toHaveLength(2);

    expect(
      matches.matches.filter(
        (match) => match.baseline.kind === "callback"
      )
    ).toHaveLength(1);

    expect(matches.unmatchedBaseline).toEqual([]);
    expect(matches.unmatchedCandidate).toEqual([]);
  });
});