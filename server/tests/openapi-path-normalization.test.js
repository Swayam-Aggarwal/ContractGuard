import { describe, expect, it } from "vitest";

import {
  normalizeOpenApiPath,
} from "../src/services/openapi-path-normalization.service.js";

import {
  createOperationIndex,
} from "../src/services/openapi-operation-index.service.js";

const createDocument = (paths = {}) => ({
  openapi: "3.2.1",

  info: {
    title: "Path Normalization Test API",
    version: "1.0.0",
  },

  paths,
});

describe("OpenAPI path normalization", () => {
  it("normalizes one path parameter without changing the original name", () => {
    expect(normalizeOpenApiPath("/users/{userId}")).toEqual({
      canonicalPath: "/users/{}",
      pathParameterNames: ["userId"],
      pathTemplateIssues: [],
    });
  });

  it("normalizes multiple path parameters by position", () => {
    expect(
      normalizeOpenApiPath("/users/{userId}/orders/{orderId}")
    ).toEqual({
      canonicalPath: "/users/{}/orders/{}",
      pathParameterNames: ["userId", "orderId"],
      pathTemplateIssues: [],
    });
  });

  it("supports path parameters embedded within a path segment", () => {
    expect(
      normalizeOpenApiPath("/files/{name}.{extension}")
    ).toEqual({
      canonicalPath: "/files/{}.{}",
      pathParameterNames: ["name", "extension"],
      pathTemplateIssues: [],
    });
  });

  it("preserves static segments and their case", () => {
    expect(normalizeOpenApiPath("/Users/Me").canonicalPath).toBe(
      "/Users/Me"
    );

    expect(normalizeOpenApiPath("/users/me").canonicalPath).not.toBe(
      normalizeOpenApiPath("/users/{id}").canonicalPath
    );
  });

  it("preserves case-sensitive path parameter names", () => {
    expect(normalizeOpenApiPath("/users/{id}").pathParameterNames).toEqual([
      "id",
    ]);

    expect(normalizeOpenApiPath("/users/{ID}").pathParameterNames).toEqual([
      "ID",
    ]);
  });

  it("reports repeated template expressions in a path", () => {
    const result = normalizeOpenApiPath("/users/{id}/orders/{id}");

    expect(result.canonicalPath).toBe("/users/{}/orders/{}");

    expect(result.pathParameterNames).toEqual([
      "id",
      "id",
    ]);

    expect(result.pathTemplateIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DUPLICATE_PATH_PARAMETER_NAME",
        }),
      ])
    );
  });

  it("reports an empty path-parameter expression", () => {
    const result = normalizeOpenApiPath("/users/{}");

    expect(result.pathTemplateIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_PATH_TEMPLATE",
        }),
      ])
    );

    expect(result.canonicalPath).toBe("/users/{}");
  });

  it("reports unclosed, nested, and stray braces without guessing a canonical path", () => {
    for (const path of [
      "/users/{id",
      "/users/{{id}}",
      "/users/id}",
    ]) {
      const result = normalizeOpenApiPath(path);

      expect(result.pathTemplateIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "INVALID_PATH_TEMPLATE",
          }),
        ])
      );

      expect(result.canonicalPath).toBe(path);
    }
  });

  it("reports a Paths Object key that does not begin with a slash", () => {
    const result = normalizeOpenApiPath("users/{id}");

    expect(result.pathTemplateIssues).toEqual([
      expect.objectContaining({
        code: "INVALID_PATH_TEMPLATE",
      }),
    ]);
  });

  it("adds canonical path metadata without changing public path or operation keys", () => {
    const document = createDocument({
      "/users/{id}": {
        get: {
          operationId: "getUser",

          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],

          responses: {
            "200": {
              description: "User.",
            },
          },
        },
      },
    });

    const [operation] = createOperationIndex(document);

    expect(operation).toMatchObject({
      path: "/users/{id}",
      canonicalPath: "/users/{}",
      pathParameterNames: ["id"],
      method: "GET",
      operationId: "getUser",
    });

    expect(operation.operationKey).toMatch(/^op_[A-Za-z0-9_-]{43}$/u);
  });

  it("attaches diagnostics when different path declarations have the same canonical shape", () => {
    const document = createDocument({
      "/users/{id}": {
        get: {
          operationId: "getUserById",
          responses: {
            "200": {
              description: "User.",
            },
          },
        },
      },

      "/users/{name}": {
        get: {
          operationId: "getUserByName",
          responses: {
            "200": {
              description: "User.",
            },
          },
        },
      },
    });

    const operations = createOperationIndex(document);

    expect(operations).toHaveLength(2);

    for (const operation of operations) {
      expect(operation.pathTemplateIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "DUPLICATE_CANONICAL_PATH",
            canonicalPath: "/users/{}",
            conflictingPaths: [
              "/users/{id}",
              "/users/{name}",
            ],
          }),
        ])
      );
    }
  });
});