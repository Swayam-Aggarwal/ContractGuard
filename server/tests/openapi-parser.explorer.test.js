
import { createHash } from "node:crypto";

import {
  describe,
  expect,
  it,
} from "vitest";

import parseOpenApiDocument from
  "../src/services/openapi-parser.service.js";

const createExplorerDocument = () => ({
  openapi: "3.2.1",

  info: {
    title: "ContractGuard Explorer Parser Test API",
    version: "1.0.0",
  },

  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        summary: "List items",

        callbacks: {
          onItemEvent: {
            "{$request.body#/callbackUrl}": {
              post: {
                operationId: "receiveItemEvent",

                responses: {
                  "200": {
                    description: "Event received.",
                  },
                },
              },
            },
          },
        },

        responses: {
          "200": {
            description: "Item list.",
          },
        },
      },

      query: {
        operationId: "queryItems",

        responses: {
          "200": {
            description: "Query results.",
          },
        },
      },

      additionalOperations: {
        SEARCH: {
          operationId: "searchItems",

          responses: {
            "200": {
              description: "Search results.",
            },
          },
        },
      },
    },
  },

  webhooks: {
    itemCreated: {
      post: {
        operationId: "receiveItemCreated",

        responses: {
          "200": {
            description: "Webhook received.",
          },
        },
      },
    },
  },
});

describe("OpenAPI parser Explorer integration", () => {
  it("should index standard, QUERY, custom, callback and webhook operations", async () => {
    const document = createExplorerDocument();

    const result = await parseOpenApiDocument(
      JSON.stringify(document),
      "json"
    );

    expect(result.openapiVersion).toBe("3.2.1");
    expect(result.pathCount).toBe(1);
    expect(result.operationCount).toBe(5);
    expect(result.operations).toHaveLength(5);

    expect(result.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "path",
          method: "GET",
          path: "/items",
          operationId: "listItems",
        }),

        expect.objectContaining({
          kind: "path",
          method: "QUERY",
          path: "/items",
          operationId: "queryItems",
        }),

        expect.objectContaining({
          kind: "path",
          method: "SEARCH",
          path: "/items",
          operationId: "searchItems",
        }),

        expect.objectContaining({
          kind: "callback",
          method: "POST",
          operationId: "receiveItemEvent",
        }),

        expect.objectContaining({
          kind: "webhook",
          method: "POST",
          operationId: "receiveItemCreated",
        }),
      ])
    );
  });

  it("should preserve legacy operation keys for standard path operations", async () => {
    const document = createExplorerDocument();

    const result = await parseOpenApiDocument(
      JSON.stringify(document),
      "json"
    );

    const operation = result.operations.find(
      (item) => item.operationId === "listItems"
    );

    const expectedHash = createHash("sha256")
      .update("GET /items", "utf8")
      .digest("base64url");

    expect(operation.operationKey).toBe(
      `op_${expectedHash}`
    );
  });

  it("should retain the original OpenAPI document", async () => {
    const document = createExplorerDocument();

    const result = await parseOpenApiDocument(
      JSON.stringify(document),
      "json"
    );

    expect(result.document).toEqual(document);

    expect(result.document.paths["/items"].additionalOperations.SEARCH)
      .toBeDefined();

    expect(result.document.webhooks.itemCreated)
      .toBeDefined();
  });
});
