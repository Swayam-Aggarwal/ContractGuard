
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  aiTestSuggestionConsentSchema,
  aiTestSuggestionPreviewQuerySchema,
  aiTestSuggestionRequestSchema,
  parseAiTestSuggestionOutput,
} from "../src/validators/aiTestSuggestion.validator.js";

const validListProductsOutput = {
  suggestions: [
    {
      title: "List products with a typical result limit",
      rationale:
        "Verify that a valid result limit returns the expected product collection.",
      testCategory: "HAPPY_PATH",
      pathParams: {},
      queryParams: {
        limit: "10",
      },
    },

    {
      title: "List products at the maximum result limit",
      rationale:
        "Exercise the upper permitted limit to verify boundary handling.",
      testCategory: "BOUNDARY",
      pathParams: {},
      queryParams: {
        limit: "50",
      },
    },
  ],
};

const validGetProductOutput = {
  suggestions: [
    {
      title: "Retrieve an existing product",
      rationale:
        "Verify that a known product identifier returns the expected product.",
      testCategory: "HAPPY_PATH",
      pathParams: {
        productId: "1001",
      },
      queryParams: {},
    },

    {
      title: "Request a product that does not exist",
      rationale:
        "Verify that the designated missing identifier returns the not-found response.",
      testCategory: "NEGATIVE",
      pathParams: {
        productId: "9999",
      },
      queryParams: {},
    },
  ],
};

describe("AI test suggestion validation", () => {
  it("accepts explicit consent only", () => {
    expect(
      aiTestSuggestionConsentSchema.safeParse({
        consent: true,
      }).success
    ).toBe(true);
  });

  it("accepts a valid selected-operation generation request", () => {
    expect(
      aiTestSuggestionRequestSchema.safeParse({
        operationId: "listProducts",
        consent: true,
      }).success
    ).toBe(true);

    expect(
      aiTestSuggestionRequestSchema.safeParse({
        operationId: "deleteProducts",
        consent: true,
      }).success
    ).toBe(false);

    expect(
      aiTestSuggestionRequestSchema.safeParse({
        operationId: "listProducts",
        consent: false,
      }).success
    ).toBe(false);
  });

  it("accepts a valid selected-operation preview query", () => {
    expect(
      aiTestSuggestionPreviewQuerySchema.safeParse({
        operationId: "listProducts",
      }).success
    ).toBe(true);

    expect(
      aiTestSuggestionPreviewQuerySchema.safeParse({
        operationId: "getProduct",
      }).success
    ).toBe(true);

    expect(
      aiTestSuggestionPreviewQuerySchema.safeParse({
        operationId: "deleteProducts",
      }).success
    ).toBe(false);
  });

  it("parses two valid listProducts scenarios", () => {
    const result = parseAiTestSuggestionOutput(
      JSON.stringify(validListProductsOutput),
      {
        operationId: "listProducts",
      }
    );

    expect(result).toHaveLength(2);
    expect(result[0].testCategory).toBe("HAPPY_PATH");
    expect(result[1].testCategory).toBe("BOUNDARY");
  });

  it("parses two valid getProduct scenarios", () => {
    const result = parseAiTestSuggestionOutput(
      JSON.stringify(validGetProductOutput),
      {
        operationId: "getProduct",
      }
    );

    expect(result).toHaveLength(2);

    expect(result[0].pathParams.productId).toBe("1001");
    expect(result[1].pathParams.productId).toBe("9999");
  });

  it("rejects a listProducts batch when a path parameter is supplied", () => {
    const invalid = structuredClone(
      validListProductsOutput
    );

    invalid.suggestions[0].pathParams = {
      productId: "1001",
    };

    expect(() =>
      parseAiTestSuggestionOutput(
        JSON.stringify(invalid),
        {
          operationId: "listProducts",
        }
      )
    ).toThrow("selected operation");
  });

  it("rejects unsupported product identifiers", () => {
    const invalid = structuredClone(
      validGetProductOutput
    );

    invalid.suggestions[0].pathParams.productId =
      "private-product-id";

    expect(() =>
      parseAiTestSuggestionOutput(
        JSON.stringify(invalid),
        {
          operationId: "getProduct",
        }
      )
    ).toThrow("selected operation");
  });

  it("rejects list limits outside the permitted range", () => {
    const invalid = structuredClone(
      validListProductsOutput
    );

    invalid.suggestions[0].queryParams.limit = "51";

    expect(() =>
      parseAiTestSuggestionOutput(
        JSON.stringify(invalid),
        {
          operationId: "listProducts",
        }
      )
    ).toThrow("validation rules");
  });

  it("rejects output that includes a model-generated operation identifier", () => {
    const invalid = structuredClone(
      validListProductsOutput
    );

    invalid.suggestions[0].operationId = "listProducts";

    expect(() =>
      parseAiTestSuggestionOutput(
        JSON.stringify(invalid),
        {
          operationId: "listProducts",
        }
      )
    ).toThrow("validation rules");
  });

  it("rejects model-generated assertions and other unknown fields", () => {
    const invalid = structuredClone(
      validListProductsOutput
    );

    invalid.suggestions[0].assertions = {
      expectedStatus: 200,
    };

    expect(() =>
      parseAiTestSuggestionOutput(
        JSON.stringify(invalid),
        {
          operationId: "listProducts",
        }
      )
    ).toThrow("validation rules");
  });

  it("rejects unsupported test categories", () => {
    const invalid = structuredClone(
      validListProductsOutput
    );

    invalid.suggestions[0].testCategory =
      "UNSUPPORTED_CATEGORY";

    expect(() =>
      parseAiTestSuggestionOutput(
        JSON.stringify(invalid),
        {
          operationId: "listProducts",
        }
      )
    ).toThrow("validation rules");
  });

  it("rejects duplicate request scenarios", () => {
    const duplicate = {
      suggestions: [
        validListProductsOutput.suggestions[0],
        {
          ...validListProductsOutput.suggestions[0],
          title: "A different title for the same request",
          rationale:
            "This scenario repeats the exact same request inputs.",
        },
      ],
    };

    expect(() =>
      parseAiTestSuggestionOutput(
        JSON.stringify(duplicate),
        {
          operationId: "listProducts",
        }
      )
    ).toThrow("selected operation");
  });

  it("rejects batches outside the two-to-four scenario range", () => {
    expect(() =>
      parseAiTestSuggestionOutput(
        JSON.stringify({
          suggestions: [
            validListProductsOutput.suggestions[0],
          ],
        }),
        {
          operationId: "listProducts",
        }
      )
    ).toThrow("validation rules");

    expect(() =>
      parseAiTestSuggestionOutput(
        JSON.stringify({
          suggestions: [
            ...validListProductsOutput.suggestions,
            {
              ...validListProductsOutput.suggestions[0],
              queryParams: {
                limit: "20",
              },
            },
            {
              ...validListProductsOutput.suggestions[0],
              queryParams: {
                limit: "30",
              },
            },
            {
              ...validListProductsOutput.suggestions[0],
              queryParams: {
                limit: "40",
              },
            },
          ],
        }),
        {
          operationId: "listProducts",
        }
      )
    ).toThrow("validation rules");
  });

  it("rejects malformed JSON and missing selected-operation context", () => {
    expect(() =>
      parseAiTestSuggestionOutput(
        "{not valid JSON",
        {
          operationId: "listProducts",
        }
      )
    ).toThrow("validation rules");

    expect(() =>
      parseAiTestSuggestionOutput(
        JSON.stringify(validListProductsOutput)
      )
    ).toThrow("validation rules");
  });
});
