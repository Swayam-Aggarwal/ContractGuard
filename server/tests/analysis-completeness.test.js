
import {
  describe,
  expect,
  it,
} from "vitest";

import createExplorerCompleteness from
  "../src/services/analysis-completeness.service.js";

const createBaseDocument = () => ({
  openapi: "3.2.1",

  info: {
    title: "ContractGuard Test API",
    version: "1.0.0",
  },

  paths: {
    "/health": {
      get: {
        operationId: "getHealth",

        responses: {
          "200": {
            description: "Healthy.",
          },
        },
      },
    },

    "/search": {},
    "/orders": {},
  },
});

describe("Explorer completeness service", () => {
  it("should report COMPLETE for standard operations", () => {
    const result = createExplorerCompleteness(
      createBaseDocument()
    );

    expect(result.explorerCompleteness).toBe("COMPLETE");
    expect(result.explorerWarnings).toEqual([]);
  });

  it("should report COMPLETE for QUERY operations", () => {
    const document = createBaseDocument();

    document.paths["/search"].query = {
      operationId: "searchResources",
      responses: {
        "200": {
          description: "Search results.",
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
    expect(result.explorerWarnings).toEqual([]);
  });

  it("should report COMPLETE for additionalOperations", () => {
    const document = createBaseDocument();

    document.paths["/search"].additionalOperations = {
      SEARCH: {
        operationId: "searchProducts",
        responses: {
          "200": {
            description: "Search results.",
          },
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
  });

  it("should report PARTIAL for querystring parameters", () => {
    const document = createBaseDocument();

    document.paths["/search"].get = {
      parameters: [
        {
          name: "query",
          in: "querystring",
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
              },
            },
          },
        },
      ],

      responses: {
        "200": {
          description: "Search results.",
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("PARTIAL");

    expect(result.explorerWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "paths./search.get.parameters.0.in",
        }),
      ])
    );
  });

  it("should report COMPLETE when webhooks are present", () => {
    const document = createBaseDocument();

    document.webhooks = {
      orderCreated: {
        post: {
          responses: {
            "200": {
              description: "Webhook received.",
            },
          },
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
  });

  it("should report COMPLETE for reusable Path Items", () => {
    const document = createBaseDocument();

    document.components = {
      pathItems: {
        SharedHealth: {
          get: {
            responses: {
              "200": {
                description: "Healthy.",
              },
            },
          },
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
  });

  it("should report COMPLETE for referenced Path Items", () => {
    const document = createBaseDocument();

    document.paths["/shared"] = {
      $ref: "#/components/pathItems/Shared",
    };

    document.components = {
      pathItems: {
        Shared: {
          get: {
            responses: {
              "200": {
                description: "Shared response.",
              },
            },
          },
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
  });

  it("should report COMPLETE for operation callbacks", () => {
    const document = createBaseDocument();

    document.paths["/orders"].post = {
      responses: {
        "200": {
          description: "Order accepted.",
        },
      },

      callbacks: {
        onOrderCreated: {
          "{$request.body#/callbackUrl}": {
            post: {
              responses: {
                "200": {
                  description: "Callback received.",
                },
              },
            },
          },
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
  });

  it("should report COMPLETE for reusable Media Type definitions", () => {
    const document = createBaseDocument();

    document.components = {
      mediaTypes: {
        ProductJson: {
          schema: {
            type: "object",
          },
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
  });

  it("should report COMPLETE for reusable callbacks and links", () => {
    const document = createBaseDocument();

    document.components = {
      callbacks: {
        OrderCreated: {
          "{$request.body#/callbackUrl}": {
            post: {
              responses: {
                "200": {
                  description: "Accepted.",
                },
              },
            },
          },
        },
      },

      links: {
        GetOrder: {
          operationId: "getOrder",
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
  });

  it("should report COMPLETE for response links", () => {
    const document = createBaseDocument();

    document.paths["/orders"].get = {
      responses: {
        "200": {
          description: "Order response.",

          links: {
            relatedOrder: {
              operationId: "getRelatedOrder",
            },
          },
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
  });

  it("should report COMPLETE for schema composition", () => {
    const document = createBaseDocument();

    document.components = {
      schemas: {
        Product: {
          allOf: [
            {
              type: "object",
            },
            {
              type: "object",
            },
          ],
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
  });

  it("should report COMPLETE for discriminator-based polymorphism", () => {
    const document = createBaseDocument();

    document.components = {
      schemas: {
        Animal: {
          type: "object",
          discriminator: {
            propertyName: "animalType",
          },
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("COMPLETE");
  });

  it("should report PARTIAL for custom schema dialect declarations", () => {
    const document = createBaseDocument();

    document.jsonSchemaDialect =
      "https://example.com/custom-schema-dialect";

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("PARTIAL");

    expect(result.explorerWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "jsonSchemaDialect",
        }),
      ])
    );
  });

  it("should report PARTIAL for dynamic JSON Schema references", () => {
    const document = createBaseDocument();

    document.components = {
      schemas: {
        Node: {
          type: "object",
          properties: {
            child: {
              $dynamicRef: "#node",
            },
          },
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("PARTIAL");

    expect(result.explorerWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field:
            "components.schemas.Node.properties.child.$dynamicRef",
        }),
      ])
    );
  });

  it("should report PARTIAL for OpenAPI streaming itemSchema", () => {
    const document = createBaseDocument();

    document.paths["/stream"] = {
      get: {
        responses: {
          "200": {
            description: "Stream response.",
            content: {
              "application/json": {
                itemSchema: {
                  type: "string",
                },
              },
            },
          },
        },
      },
    };

    const result = createExplorerCompleteness(document);

    expect(result.explorerCompleteness).toBe("PARTIAL");
  });

  it("should report PARTIAL when circular references are detected", () => {
    const document = createBaseDocument();

    const result = createExplorerCompleteness(document, [
      {
        field: "document",
        message:
          "Circular internal references were detected. They are preserved without dereferencing.",
      },
    ]);

    expect(result.explorerCompleteness).toBe("PARTIAL");
  });

  it("should keep ordinary parser warnings separate from completeness", () => {
    const document = createBaseDocument();

    const parserWarnings = [
      {
        field: "info.description",
        message: "Optional description is missing.",
      },
    ];

    const result = createExplorerCompleteness(
      document,
      parserWarnings
    );

    expect(result.explorerCompleteness).toBe("COMPLETE");
    expect(result.explorerWarnings).toEqual([]);
    expect(parserWarnings).toHaveLength(1);
  });

  it("should remove duplicate circular-reference warnings", () => {
    const document = createBaseDocument();

    const warning = {
      field: "document",
      message:
        "Circular internal references were detected. They are preserved without dereferencing.",
    };

    const result = createExplorerCompleteness(document, [
      warning,
      warning,
    ]);

    expect(result.explorerWarnings).toHaveLength(1);
  });
});
