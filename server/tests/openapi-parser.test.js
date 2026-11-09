
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import parseOpenApiDocument, {
  MAX_DOCUMENT_NESTING_DEPTH,
  MAX_OPERATIONS,
  MAX_PATH_ENTRIES,
  MAX_REFERENCE_DEPTH,
  MAX_SPEC_BYTES,
} from "../src/services/openapi-parser.service.js";

const demoStoreV1 = await readFile(
  new URL("../../examples/demo-store-v1.yaml", import.meta.url),
  "utf8"
);

const demoStoreV2 = await readFile(
  new URL("../../examples/demo-store-v2.yaml", import.meta.url),
  "utf8"
);

const createBaseDocument = () => ({
  openapi: "3.0.3",
  info: {
    title: "Test API",
    version: "1.0.0",
  },
  paths: {},
});

describe("OpenAPI parser service", () => {
  describe("valid documents", () => {
    it("should parse the Demo Store v1 fixture", async () => {
      const result = await parseOpenApiDocument(
        demoStoreV1,
        "yaml"
      );

      expect(result.openapiVersion).toBe("3.0.3");
      expect(result.title).toBe("Demo Store API");
      expect(result.infoVersion).toBe("1.0.0");
      expect(result.sourceFormat).toBe("yaml");
      expect(result.pathCount).toBe(2);
      expect(result.operationCount).toBe(2);
      expect(result.operations).toHaveLength(2);
      expect(result.schemaNames).toEqual([
        "Error",
        "Product",
      ]);
    });

    it("should parse the Demo Store v2 fixture", async () => {
      const result = await parseOpenApiDocument(
        demoStoreV2,
        "yaml"
      );

      expect(result.openapiVersion).toBe("3.0.3");
      expect(result.title).toBe("Demo Store API");
      expect(result.infoVersion).toBe("2.0.0");
      expect(result.pathCount).toBe(2);
      expect(result.operationCount).toBe(2);
      expect(result.operations).toHaveLength(2);
    });

    it("should parse a valid JSON document", async () => {
      const document = createBaseDocument();

      document.paths = {
        "/status": {
          get: {
            summary: "Check API status",
            responses: {
              "200": {
                description: "API is available.",
              },
            },
          },
        },
      };

      const result = await parseOpenApiDocument(
        JSON.stringify(document),
        "json"
      );

      expect(result.sourceFormat).toBe("json");
      expect(result.pathCount).toBe(1);
      expect(result.operationCount).toBe(1);
      expect(result.operations[0].method).toBe("GET");
    });

    it("should count overridden path-level parameters only once", async () => {
      const document = createBaseDocument();

      document.paths = {
        "/products": {
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
              },
            },
            {
              name: "x-client",
              in: "header",
              schema: {
                type: "string",
              },
            },
          ],

          get: {
            parameters: [
              {
                name: "limit",
                in: "query",
                description: "Operation-level override",
                schema: {
                  type: "integer",
                  maximum: 25,
                },
              },
            ],

            responses: {
              "200": {
                description: "Successful response.",
              },
            },
          },
        },
      };

      const result = await parseOpenApiDocument(
        JSON.stringify(document),
        "json"
      );

      expect(result.operationCount).toBe(1);
      expect(result.operations[0].parameterCount).toBe(2);
    });

    it("should generate stable URL-safe operation keys", async () => {
      const firstResult = await parseOpenApiDocument(
        demoStoreV1,
        "yaml"
      );

      const secondResult = await parseOpenApiDocument(
        demoStoreV1,
        "yaml"
      );

      expect(firstResult.operations[0].operationKey).toBe(
        secondResult.operations[0].operationKey
      );

      for (const operation of firstResult.operations) {
        expect(operation.operationKey).toMatch(
          /^op_[A-Za-z0-9_-]+$/u
        );
      }
    });

    it("should preserve valid internal references", async () => {
      const result = await parseOpenApiDocument(
        demoStoreV1,
        "yaml"
      );

      expect(result.referenceCount).toBeGreaterThan(0);
      expect(
        result.document.components.schemas.Product
      ).toBeDefined();
    });

    it("should accept recursive internal references without infinite traversal", async () => {
      const document = createBaseDocument();

      document.paths = {
        "/nodes": {
          get: {
            responses: {
              "200": {
                description: "A node.",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/Node",
                    },
                  },
                },
              },
            },
          },
        },
      };

      document.components = {
        schemas: {
          Node: {
            type: "object",
            properties: {
              child: {
                $ref: "#/components/schemas/Node",
              },
            },
          },
        },
      };

      const result = await parseOpenApiDocument(
        JSON.stringify(document),
        "json"
      );

      expect(result.referenceCount).toBe(2);
      expect(
        result.warnings.some((warning) =>
          warning.message.includes(
            "Circular internal references"
          )
        )
      ).toBe(true);
    });
  });

  describe("invalid input", () => {
    it("should reject malformed JSON", async () => {
      await expect(
        parseOpenApiDocument('{"openapi": }', "json")
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "SPEC_INVALID",
      });
    });

    it("should reject malformed YAML", async () => {
      await expect(
        parseOpenApiDocument("openapi: [", "yaml")
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "SPEC_INVALID",
      });
    });

    it("should reject an empty document", async () => {
      await expect(
        parseOpenApiDocument("", "json")
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "SPEC_INVALID",
      });
    });

    it("should reject a document with a non-object root", async () => {
      await expect(
        parseOpenApiDocument("[]", "json")
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_INVALID",
      });
    });

    it("should reject an unsupported file format", async () => {
      await expect(
        parseOpenApiDocument("{}", "xml")
      ).rejects.toMatchObject({
        statusCode: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
      });
    });

    it("should reject multi-document YAML", async () => {
      const sourceText = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths: {}
---
openapi: 3.0.3
info:
  title: Another API
  version: 1.0.0
paths: {}
`;

      await expect(
        parseOpenApiDocument(sourceText, "yaml")
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "SPEC_INVALID",
      });
    });

    it("should reject YAML aliases", async () => {
      const sourceText = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths: {}
x-shared: &shared
  enabled: true
x-copy: *shared
`;

      await expect(
        parseOpenApiDocument(sourceText, "yaml")
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "SPEC_INVALID",
      });
    });

    it("should reject a document without valid info metadata", async () => {
      const document = createBaseDocument();
      delete document.info;

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_INVALID",
      });
    });
  });

  describe("OpenAPI version policy", () => {
    it.each(["3.0.4", "3.1.2", "3.2.1"])(
      "should accept OpenAPI version %s",
      async (version) => {
        const document = createBaseDocument();

        document.openapi = version;

        document.paths = {
          "/health": {
            get: {
              operationId: "getHealth",
              summary: "Check API health",
              responses: {
                "200": {
                  description: "API is healthy.",
                },
              },
            },
          },
        };

        document.components = {
          schemas: {
            Health: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  enum: ["ok"],
                },
              },
            },
          },
        };

        const result = await parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        );

        expect(result.openapiVersion).toBe(version);
        expect(result.title).toBe("Test API");
        expect(result.operationCount).toBe(1);
        expect(result.operations).toHaveLength(1);
        expect(result.operations[0]).toMatchObject({
          method: "GET",
          path: "/health",
          operationId: "getHealth",
        });
        expect(result.schemaNames).toEqual(["Health"]);
      }
    );

    it("should reject Swagger 2.0", async () => {
      const sourceText = `
swagger: "2.0"
info:
  title: Legacy API
  version: 1.0.0
paths: {}
`;

      await expect(
        parseOpenApiDocument(sourceText, "yaml")
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_VERSION_UNSUPPORTED",
      });
    });

    it("should reject OpenAPI 3.3.0", async () => {
      const document = createBaseDocument();
      document.openapi = "3.3.0";

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_VERSION_UNSUPPORTED",
      });
    });

    it("should reject a document without an OpenAPI version", async () => {
      const document = createBaseDocument();
      delete document.openapi;

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_INVALID",
      });
    });
  });

  describe("reference security and limits", () => {
    it("should reject HTTP references", async () => {
      const document = createBaseDocument();

      document.components = {
        schemas: {
          Product: {
            $ref: "https://example.com/schemas/product.yaml",
          },
        },
      };

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_INVALID",
      });
    });

    it("should treat $ref inside examples and arbitrary payload values as data", async () => {
      const document = createBaseDocument();
      document.openapi = "3.1.2";

      document.paths = {
        "/examples": {
          get: {
            responses: {
              "200": {
                description: "Example payload.",
                content: {
                  "application/json": {
                    examples: {
                      sample: {
                        summary: "A payload containing a literal $ref key.",
                        value: {
                          $ref: "https://example.com/payload/123",
                          nested: {
                            $ref: "./not-a-reference.json#/value",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      document.components = {
        schemas: {
          Payload: {
            type: "object",
            properties: {
              metadata: {
                type: "object",
                default: {
                  $ref: "https://example.com/default",
                },
                example: {
                  $ref: "./example.json",
                },
              },
            },
            enum: [
              {
                $ref: "https://example.com/enum-value",
              },
            ],
          },
        },
      };

      document["x-example-data"] = {
        $ref: "https://example.com/extension-data",
      };

      const result = await parseOpenApiDocument(
        JSON.stringify(document),
        "json"
      );

      expect(result.referenceCount).toBe(0);
    });

    it("should inspect an actual Example Reference Object but not its value", async () => {
      const document = createBaseDocument();

      document.paths = {
        "/examples": {
          get: {
            responses: {
              "200": {
                description: "Example payload.",
                content: {
                  "application/json": {
                    examples: {
                      sample: {
                        $ref: "#/components/examples/Shared",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      document.components = {
        examples: {
          Shared: {
            summary: "A reusable example.",
            value: {
              $ref: "https://example.com/this-is-payload-data",
            },
          },
        },
      };

      const result = await parseOpenApiDocument(
        JSON.stringify(document),
        "json"
      );

      expect(result.referenceCount).toBe(1);
    });

    it("should reject relative external references", async () => {
      const document = createBaseDocument();

      document.components = {
        schemas: {
          Product: {
            $ref: "./product.yaml#/Product",
          },
        },
      };

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_INVALID",
      });
    });

    it("should reject unresolved internal references", async () => {
      const document = createBaseDocument();

      document.components = {
        schemas: {
          Product: {
            $ref: "#/components/schemas/Missing",
          },
        },
      };

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_INVALID",
      });
    });

    it("should reject invalid JSON Pointer escape sequences", async () => {
      const document = createBaseDocument();

      document.components = {
        schemas: {
          Product: {
            $ref: "#/components/schemas/Invalid~2Name",
          },
        },
      };

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_INVALID",
      });
    });

    it("should reject reference chains deeper than the configured limit", async () => {
      const document = createBaseDocument();

      document.paths = {
        "/nodes": {
          get: {
            responses: {
              "200": {
                description: "A node.",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/S0",
                    },
                  },
                },
              },
            },
          },
        },
      };

      const schemas = {};

      for (
        let index = 0;
        index <= MAX_REFERENCE_DEPTH;
        index += 1
      ) {
        schemas[`S${index}`] =
          index === MAX_REFERENCE_DEPTH
            ? { type: "object" }
            : {
                type: "object",
                properties: {
                  next: {
                    $ref: `#/components/schemas/S${index + 1}`,
                  },
                },
              };
      }

      document.components = { schemas };

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_LIMIT_EXCEEDED",
      });
    });
  });

  describe("resource limits", () => {
    it("should reject documents larger than 1 MiB", async () => {
      const sourceText = " ".repeat(MAX_SPEC_BYTES + 1);

      await expect(
        parseOpenApiDocument(sourceText, "json")
      ).rejects.toMatchObject({
        statusCode: 413,
        code: "SPEC_LIMIT_EXCEEDED",
      });
    });

    it("should reject more than the maximum number of paths", async () => {
      const document = createBaseDocument();

      document.paths = Object.fromEntries(
        Array.from(
          { length: MAX_PATH_ENTRIES + 1 },
          (_, index) => [`/path-${index}`, {}]
        )
      );

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_LIMIT_EXCEEDED",
      });
    });

    it("should reject more than the maximum number of operations", async () => {
      const document = createBaseDocument();

      const methods = [
        "get",
        "put",
        "post",
        "delete",
        "options",
        "head",
        "patch",
        "trace",
      ];

      document.paths = {};

      for (let index = 0; index < 63; index += 1) {
        const pathItem = {};

        for (const method of methods) {
          pathItem[method] = {
            responses: {
              "200": {
                description: "OK",
              },
            },
          };
        }

        document.paths[`/path-${index}`] = pathItem;
      }

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_LIMIT_EXCEEDED",
      });
    });

    it("should reject excessive document nesting", async () => {
      const document = createBaseDocument();

      let nestedValue = "end";

      for (
        let index = 0;
        index <= MAX_DOCUMENT_NESTING_DEPTH;
        index += 1
      ) {
        nestedValue = [nestedValue];
      }

      document["x-deep"] = nestedValue;

      await expect(
        parseOpenApiDocument(
          JSON.stringify(document),
          "json"
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "SPEC_LIMIT_EXCEEDED",
      });
    });
  });
});
