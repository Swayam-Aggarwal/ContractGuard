
import { describe, expect, it } from "vitest";

import { createOperationIndex } from
  "../src/services/openapi-operation-index.service.js";

const createDocument = () => ({
  openapi: "3.2.1",

  info: {
    title: "Operation Index Test API",
    version: "1.0.0",
  },

  paths: {},
});

describe("OpenAPI operation index service", () => {
  it("should index standard HTTP operations and preserve legacy operation keys", () => {
    const document = createDocument();

    document.paths["/health"] = {
      get: {
        operationId: "getHealth",

        responses: {
          "200": {
            description: "Healthy.",
          },
        },
      },
    };

    const operations = createOperationIndex(document);

    expect(operations).toHaveLength(1);

    expect(operations[0]).toMatchObject({
      kind: "path",
      method: "GET",
      path: "/health",
      operationId: "getHealth",
      operationKey: expect.stringMatching(
        /^op_[A-Za-z0-9_-]{43}$/u
      ),
    });
  });

  it("should index OpenAPI QUERY operations", () => {
    const document = createDocument();

    document.paths["/search"] = {
      query: {
        operationId: "searchResources",

        responses: {
          "200": {
            description: "Results.",
          },
        },
      },
    };

    expect(createOperationIndex(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "QUERY",
          path: "/search",
          operationId: "searchResources",
        }),
      ])
    );
  });

  it("should index additional operation methods", () => {
    const document = createDocument();

    document.paths["/orders"] = {
      additionalOperations: {
        SEARCH: {
          operationId: "searchOrders",

          responses: {
            "200": {
              description: "Results.",
            },
          },
        },
      },
    };

    expect(createOperationIndex(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "SEARCH",
          path: "/orders",
          operationId: "searchOrders",
        }),
      ])
    );
  });

  it("should index webhook operations separately from paths", () => {
    const document = createDocument();

    document.webhooks = {
      orderCreated: {
        post: {
          operationId: "receiveOrderCreated",

          responses: {
            "200": {
              description: "Received.",
            },
          },
        },
      },
    };

    expect(createOperationIndex(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "webhook",
          method: "POST",
          path: "orderCreated",
          sourceName: "orderCreated",
        }),
      ])
    );
  });

  it("should index callback operations", () => {
    const document = createDocument();

    document.paths["/orders"] = {
      post: {
        operationId: "createOrder",

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

        responses: {
          "201": {
            description: "Created.",
          },
        },
      },
    };

    expect(createOperationIndex(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "callback",
          method: "POST",
          path: "{$request.body#/callbackUrl}",
          operationId: "receiveStatus",
          callbackName: "onStatus",
        }),
      ])
    );
  });

  it("should index standalone referenced Path Items", () => {
    const document = createDocument();

    document.paths["/products"] = {
      $ref: "#/components/pathItems/ProductPath",
    };

    document.components = {
      pathItems: {
        ProductPath: {
          get: {
            operationId: "listProducts",

            responses: {
              "200": {
                description: "Products.",
              },
            },
          },
        },
      },
    };

    expect(createOperationIndex(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "path",
          method: "GET",
          path: "/products",
          operationId: "listProducts",
          pathItemPointer: "#/components/pathItems/ProductPath",
        }),
      ])
    );
  });

  it("should reject Path Item references with adjacent fields rather than silently ignoring them", () => {
    const document = createDocument();

    document.paths["/products"] = {
      $ref: "#/components/pathItems/ProductPath",

      get: {
        operationId: "localListProducts",

        responses: {
          "200": {
            description: "Products.",
          },
        },
      },
    };

    document.components = {
      pathItems: {
        ProductPath: {
          post: {
            operationId: "createProduct",

            responses: {
              "201": {
                description: "Created.",
              },
            },
          },
        },
      },
    };

    expect(() => createOperationIndex(document)).toThrow(
      expect.objectContaining({
        statusCode: 422,
        code: "SPEC_UNSUPPORTED_CONSTRUCT",
      })
    );
  });

  it("should reject referenced Path Items with adjacent parameters", () => {
    const document = createDocument();

    document.paths["/products"] = {
      $ref: "#/components/pathItems/ProductPath",

      parameters: [
        {
          name: "tenantId",
          in: "header",
          schema: {
            type: "string",
          },
        },
      ],
    };

    document.components = {
      pathItems: {
        ProductPath: {
          get: {
            operationId: "listProducts",

            responses: {
              "200": {
                description: "Products.",
              },
            },
          },
        },
      },
    };

    expect(() => createOperationIndex(document)).toThrow(
      expect.objectContaining({
        code: "SPEC_UNSUPPORTED_CONSTRUCT",
      })
    );
  });
});
