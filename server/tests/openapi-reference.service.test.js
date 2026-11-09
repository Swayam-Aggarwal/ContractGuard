import { describe, expect, it } from "vitest";

import createOpenApiReferenceService from
  "../src/services/openapi-reference.service.js";

describe("OpenAPI reference service", () => {
  it("should resolve a direct internal reference", () => {
    const document = {
      components: {
        schemas: {
          Product: {
            type: "object",
          },
        },
      },
    };

    const references = createOpenApiReferenceService(document);

    expect(
      references.resolveReferenceChain(
        "#/components/schemas/Product"
      )
    ).toMatchObject({
      targetPointer: "#/components/schemas/Product",
      value: { type: "object" },
      circular: false,
    });
  });

  it("should follow a chain of reference objects", () => {
    const document = {
      components: {
        schemas: {
          ProductAlias: {
            $ref: "#/components/schemas/Product",
          },
          Product: {
            type: "object",
          },
        },
      },
    };

    const references = createOpenApiReferenceService(document);

    expect(
      references.resolveReferenceChain(
        "#/components/schemas/ProductAlias"
      )
    ).toMatchObject({
      targetPointer: "#/components/schemas/Product",
      value: { type: "object" },
      circular: false,
    });
  });

  it("should report circular reference chains without expanding them", () => {
    const document = {
      components: {
        schemas: {
          First: {
            $ref: "#/components/schemas/Second",
          },
          Second: {
            $ref: "#/components/schemas/First",
          },
        },
      },
    };

    const references = createOpenApiReferenceService(document);

    expect(
      references.resolveReferenceChain(
        "#/components/schemas/First"
      )
    ).toMatchObject({
      circular: true,
    });
  });

  it("should throw a not-found error for missing reference targets", () => {
    const references = createOpenApiReferenceService({});

    let error;

    try {
      references.resolveReferenceChain(
        "#/components/schemas/Missing"
      );
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("should resolve an object only when it contains a reference", () => {
    const references = createOpenApiReferenceService({});
    const value = { type: "string" };

    expect(
      references.resolveObject(value)
    ).toMatchObject({
      value,
      referenced: false,
      circular: false,
    });
  });
});