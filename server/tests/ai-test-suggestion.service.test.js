
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createAiTestSuggestionService,
} from "../src/services/ai-test-suggestion.service.js";

const PROJECT_ID = "507f1f77bcf86cd799439011";
const REPORT_ID = "507f1f77bcf86cd799439012";
const BASELINE_ID = "507f1f77bcf86cd799439013";

const LIST_PRODUCTS_KEY = `op_${"a".repeat(43)}`;
const GET_PRODUCT_KEY = `op_${"b".repeat(43)}`;

/*
 * Return a fresh operation index every time.
 *
 * Never reuse a mutable object between tests. In particular,
 * the missing-operation-key test must not contaminate later tests.
 */
const createOperationDefinitions = () => ({
  listProducts: {
    operationKey: LIST_PRODUCTS_KEY,
    method: "GET",
    path: "/products",
    specVersionId: BASELINE_ID,
  },

  getProduct: {
    operationKey: GET_PRODUCT_KEY,
    method: "GET",
    path: "/products/{productId}",
    specVersionId: BASELINE_ID,
  },
});

const createContext = () => {
  const operationsByOperationId =
    createOperationDefinitions();

  return {
    contextVersion: "DEMO_STORE_AI_CONTEXT_V2",

    baselineVersionId: BASELINE_ID,

    selectedOperationId: null,

    operationsByOperationId,

    modelContext: {
      contextVersion: "DEMO_STORE_AI_CONTEXT_V2",

      comparison: {
        baseline: {
          fixtureId: "DEMO_STORE_V1",
          apiVersion: "1.0.0",
        },

        candidate: {
          fixtureId: "DEMO_STORE_V2",
          apiVersion: "2.0.0",
        },

        direction:
          "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
      },

      operations: [
        {
          operationId: "listProducts",
          method: "GET",
          path: "/products",
          pathParameters: [],
          queryParameters: ["limit"],
        },

        {
          operationId: "getProduct",
          method: "GET",
          path: "/products/{productId}",
          pathParameters: ["productId"],
          queryParameters: [],
        },
      ],

      compatibilityFindings: [
        {
          category: "schema",
          classification: "BREAKING",
          method: "GET",
          path: "/products",
          field: "Product.items",
          summary:
            "The product collection response changed.",
        },

        {
          category: "schema",
          classification: "BREAKING",
          method: "GET",
          path: "/products/{productId}",
          field: "Product.description",
          summary:
            "A product field changed.",
        },
      ],
    },
  };
};

const validListProductsSuggestions = [
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
];

const config = {
  GEMINI_API_KEY: "test-key",
  GEMINI_MODEL: "gemini-3.5-flash-lite",
};

const createService = ({
  context,
  suggestions = validListProductsSuggestions,
  contextBuilder,
  provider,
  persistence,
  outputParser,
  now,
} = {}) => {
  const resolvedContext =
    context ?? createContext();

  const resolvedProvider = provider ?? {
    generateSuggestions: vi.fn().mockResolvedValue(
      '{"suggestions":[]}'
    ),
  };

  const resolvedPersistence =
    persistence ?? vi.fn().mockResolvedValue([
      {
        id: "case-1",
        source: "AI",
        status: "DRAFT",
      },

      {
        id: "case-2",
        source: "AI",
        status: "DRAFT",
      },
    ]);

  const resolvedOutputParser =
    outputParser ?? vi.fn().mockReturnValue(suggestions);

  const resolvedContextBuilder =
    contextBuilder ?? vi.fn().mockImplementation(
      async ({ operationId }) => ({
        ...resolvedContext,
        selectedOperationId: operationId,
      })
    );

  const resolvedProviderFactory =
    vi.fn(() => resolvedProvider);

  const service = createAiTestSuggestionService({
    contextBuilder: resolvedContextBuilder,
    providerFactory: resolvedProviderFactory,
    outputParser: resolvedOutputParser,
    persistence: resolvedPersistence,

    now: now ?? vi.fn()
      .mockReturnValueOnce(
        new Date("2026-11-13T00:00:00.000Z")
      )
      .mockReturnValueOnce(
        new Date("2026-11-13T00:00:05.000Z")
      ),
  });

  return {
    service,
    context: resolvedContext,
    provider: resolvedProvider,
    providerFactory: resolvedProviderFactory,
    persistence: resolvedPersistence,
    outputParser: resolvedOutputParser,
    contextBuilder: resolvedContextBuilder,
  };
};

describe("AI test suggestion orchestration", () => {
  it("resolves the selected operation and passes its canonical key to persistence", async () => {
    const {
      service,
      provider,
      persistence,
      outputParser,
      contextBuilder,
    } = createService();

    const result =
      await service.generateAiTestSuggestions({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        operationId: "listProducts",
        consent: true,
        config,
      });

    expect(contextBuilder).toHaveBeenCalledOnce();

    /*
     * This is the important context-builder contract:
     * operationId must be passed explicitly.
     */
    expect(contextBuilder).toHaveBeenCalledWith({
      ownerId: PROJECT_ID,
      projectId: PROJECT_ID,
      reportId: REPORT_ID,
      operationId: "listProducts",
    });

    expect(provider.generateSuggestions).toHaveBeenCalledOnce();

    const sentContext =
      provider.generateSuggestions.mock.calls[0][0];

    /*
     * Gemini receives only the selected operation.
     */
    expect(sentContext.operations).toHaveLength(1);

    expect(sentContext.operations[0]).toEqual({
      operationId: "listProducts",
      method: "GET",
      path: "/products",
      pathParameters: [],
      queryParameters: ["limit"],
    });

    expect(sentContext.compatibilityFindings).toHaveLength(1);

    /*
     * Canonical operation keys must never leave ContractGuard.
     */
    expect(
      JSON.stringify(sentContext)
    ).not.toContain(LIST_PRODUCTS_KEY);

    expect(
      JSON.stringify(sentContext)
    ).not.toContain(GET_PRODUCT_KEY);

    expect(outputParser).toHaveBeenCalledWith(
      expect.any(String),
      {
        operationId: "listProducts",
      }
    );

    expect(persistence).toHaveBeenCalledOnce();

    const persistenceInput =
      persistence.mock.calls[0][0];

    expect(persistenceInput).toMatchObject({
      ownerId: PROJECT_ID,
      projectId: PROJECT_ID,
      specVersionId: BASELINE_ID,
      operationId: "listProducts",
      operationKey: LIST_PRODUCTS_KEY,
      operationPath: "/products",
    });

    /*
     * The persistence service receives only the validated
     * case fields. It does not receive model-generated keys
     * or assertions.
     */
    expect(persistenceInput.cases).toEqual(
      validListProductsSuggestions
    );

    expect(persistenceInput.cases[0]).not.toHaveProperty(
      "operationId"
    );

    expect(persistenceInput.cases[0]).not.toHaveProperty(
      "operationKey"
    );

    expect(persistenceInput.cases[0]).not.toHaveProperty(
      "assertions"
    );

    expect(
      persistenceInput.generationMetadata
    ).toMatchObject({
      provider: "Google Gemini",
      model: "gemini-3.5-flash-lite",
      contextVersion: "DEMO_STORE_AI_CONTEXT_V2",
      consentVersion: "AI_TEST_SUGGESTION_CONSENT_V1",
    });

    expect(result.selectedOperationId)
      .toBe("listProducts");

    expect(result.specVersionId)
      .toBe(BASELINE_ID);

    expect(result.createdCount).toBe(2);
    expect(result.testCases).toHaveLength(2);
  });

  it("resolves getProduct independently when that operation is selected", async () => {
    const getProductSuggestions = [
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
          "Verify that the designated missing product identifier returns the not-found response.",
        testCategory: "NEGATIVE",
        pathParams: {
          productId: "9999",
        },
        queryParams: {},
      },
    ];

    const {
      service,
      provider,
      persistence,
      contextBuilder,
    } = createService({
      suggestions: getProductSuggestions,
    });

    const result =
      await service.generateAiTestSuggestions({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        operationId: "getProduct",
        consent: true,
        config,
      });

    expect(contextBuilder).toHaveBeenCalledWith({
      ownerId: PROJECT_ID,
      projectId: PROJECT_ID,
      reportId: REPORT_ID,
      operationId: "getProduct",
    });

    const sentContext =
      provider.generateSuggestions.mock.calls[0][0];

    expect(sentContext.operations).toHaveLength(1);

    expect(sentContext.operations[0].operationId)
      .toBe("getProduct");

    expect(sentContext.operations[0].path)
      .toBe("/products/{productId}");

    expect(persistence).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "getProduct",
        operationKey: GET_PRODUCT_KEY,
        operationPath: "/products/{productId}",
        cases: getProductSuggestions,
      })
    );

    expect(result.selectedOperationId)
      .toBe("getProduct");
  });

  it("returns both available operations in preview while keeping the provider context limited to the selected operation", async () => {
    const {
      service,
      providerFactory,
      persistence,
      contextBuilder,
    } = createService();

    const result =
      await service.getAiTestSuggestionPreview({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        operationId: "listProducts",
        config,
      });

    expect(contextBuilder).toHaveBeenCalledWith({
      ownerId: PROJECT_ID,
      projectId: PROJECT_ID,
      reportId: REPORT_ID,
      operationId: "listProducts",
    });

    expect(result.provider).toBe("Google Gemini");
    expect(result.providerConfigured).toBe(true);

    expect(result.selectedOperation).toEqual({
      operationId: "listProducts",
      method: "GET",
      path: "/products",
    });

    expect(result.availableOperations).toHaveLength(2);

    expect(result.providerSubmissionPreview.context.operations)
      .toHaveLength(1);

    expect(
      result.providerSubmissionPreview.context.operations[0]
        .operationId
    ).toBe("listProducts");

    expect(providerFactory).not.toHaveBeenCalled();
    expect(persistence).not.toHaveBeenCalled();
  });

  it("rejects requests without explicit consent before loading context", async () => {
    const {
      service,
      contextBuilder,
      provider,
      persistence,
    } = createService();

    await expect(
      service.generateAiTestSuggestions({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        operationId: "listProducts",
        consent: false,
        config,
      })
    ).rejects.toMatchObject({
      code: "AI_CONSENT_REQUIRED",
      statusCode: 400,
    });

    expect(contextBuilder).not.toHaveBeenCalled();
    expect(provider.generateSuggestions).not.toHaveBeenCalled();
    expect(persistence).not.toHaveBeenCalled();
  });

  it("rejects an unsupported operation before loading context", async () => {
    const {
      service,
      contextBuilder,
      provider,
      persistence,
    } = createService();

    await expect(
      service.generateAiTestSuggestions({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        operationId: "deleteProducts",
        consent: true,
        config,
      })
    ).rejects.toMatchObject({
      code: "AI_OPERATION_NOT_FOUND",
      statusCode: 422,
    });

    expect(contextBuilder).not.toHaveBeenCalled();
    expect(provider.generateSuggestions).not.toHaveBeenCalled();
    expect(persistence).not.toHaveBeenCalled();
  });

  it("does not call Gemini when the API key is missing", async () => {
    const {
      service,
      contextBuilder,
      provider,
      persistence,
    } = createService();

    await expect(
      service.generateAiTestSuggestions({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        operationId: "listProducts",
        consent: true,
        config: {
          GEMINI_API_KEY: "",
          GEMINI_MODEL: "gemini-3.5-flash-lite",
        },
      })
    ).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
      statusCode: 503,
    });

    expect(contextBuilder).not.toHaveBeenCalled();
    expect(provider.generateSuggestions).not.toHaveBeenCalled();
    expect(persistence).not.toHaveBeenCalled();
  });

  it("rejects a missing canonical operation key before calling Gemini", async () => {
    const context = createContext();

    /*
     * This modifies only this test's own context.
     * createContext() creates a fresh operation index every time.
     */
    context.operationsByOperationId.listProducts = {
      ...context.operationsByOperationId.listProducts,
      operationKey: undefined,
    };

    const {
      service,
      provider,
      persistence,
    } = createService({
      context,
    });

    await expect(
      service.generateAiTestSuggestions({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        operationId: "listProducts",
        consent: true,
        config,
      })
    ).rejects.toMatchObject({
      code: "AI_OPERATION_NOT_FOUND",
      statusCode: 422,
    });

    expect(provider.generateSuggestions).not.toHaveBeenCalled();
    expect(persistence).not.toHaveBeenCalled();
  });

  it("rejects model output containing a suggestion for another operation", async () => {
    const invalidSuggestions = [
      {
        operationId: "getProduct",
        title: "Retrieve an existing product",
        rationale:
          "Verify that a known product identifier returns the product.",
        testCategory: "HAPPY_PATH",
        pathParams: {
          productId: "1001",
        },
        queryParams: {},
      },

      ...validListProductsSuggestions.slice(0, 1),
    ];

    const {
      service,
      persistence,
    } = createService({
      suggestions: invalidSuggestions,
    });

    await expect(
      service.generateAiTestSuggestions({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        operationId: "listProducts",
        consent: true,
        config,
      })
    ).rejects.toMatchObject({
      code: "AI_INVALID_MODEL_OUTPUT",
      statusCode: 502,
    });

    expect(persistence).not.toHaveBeenCalled();
  });

  it("does not persist suggestions that do not match the required draft format", async () => {
    const invalidSuggestions = [
      {
        title: "Valid title",
        rationale: "This rationale is sufficiently long.",
        testCategory: "UNSUPPORTED_CATEGORY",
        pathParams: {},
        queryParams: {
          limit: "10",
        },
      },

      validListProductsSuggestions[1],
    ];

    const {
      service,
      persistence,
    } = createService({
      suggestions: invalidSuggestions,
    });

    await expect(
      service.generateAiTestSuggestions({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        operationId: "listProducts",
        consent: true,
        config,
      })
    ).rejects.toMatchObject({
      code: "AI_INVALID_MODEL_OUTPUT",
      statusCode: 502,
    });

    expect(persistence).not.toHaveBeenCalled();
  });
});
