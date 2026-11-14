
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AI_TEST_SUGGESTION_CONTEXT_VERSION,
  createAiTestSuggestionContextService,
} from "../src/services/ai-test-suggestion-context.service.js";

const PROJECT_ID = "507f1f77bcf86cd799439011";
const BASELINE_ID = "507f1f77bcf86cd799439012";
const CANDIDATE_ID = "507f1f77bcf86cd799439013";
const REPORT_ID = "507f1f77bcf86cd799439014";

const BASELINE_HASH = "a".repeat(64);
const CANDIDATE_HASH = "b".repeat(64);

const baseline = {
  _id: BASELINE_ID,
  projectId: PROJECT_ID,
  contentHash: BASELINE_HASH,
};

const candidate = {
  _id: CANDIDATE_ID,
  projectId: PROJECT_ID,
  contentHash: CANDIDATE_HASH,
};

const report = {
  id: REPORT_ID,
  projectId: PROJECT_ID,

  baselineVersionId: BASELINE_ID,
  candidateVersionId: CANDIDATE_ID,

  baselineContentHash: BASELINE_HASH,
  candidateContentHash: CANDIDATE_HASH,

  analysisStatus: "COMPLETE",

  direction:
    "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",

  changes: [
    {
      category: "schema",
      classification: "BREAKING",
      method: "GET",
      path: "/products/{productId}",
      field: "Product.description",
      summary: "A required baseline product field was removed.",
    },

    {
      category: "response",
      classification: "NON_BREAKING",
      method: "GET",
      path: "/products",
      field: "Product.total",
      summary: "The optional list total property changed.",
    },
  ],
};

const operations = [
  {
    operationKey: `op_${"a".repeat(43)}`,
    operationId: "listProducts",
    kind: "path",
    method: "GET",
    path: "/products",
  },

  {
    operationKey: `op_${"b".repeat(43)}`,
    operationId: "getProduct",
    kind: "path",
    method: "GET",
    path: "/products/{productId}",
  },
];

const createDependencies = (overrides = {}) => ({
  reportService: {
    getDiffReport: vi.fn().mockResolvedValue(report),
  },

  specificationService: {
    getSpecificationVersionRecord: vi.fn(
      async (_ownerId, id) =>
        id === BASELINE_ID ? baseline : candidate
    ),
  },

  explorerService: {
    listSpecificationOperations: vi.fn().mockResolvedValue({
      operations,
    }),
  },

  fixtureVerifier: vi.fn().mockReturnValue({
    eligible: true,

    baseline: {
      fixtureId: "DEMO_STORE_V1",
    },

    candidate: {
      fixtureId: "DEMO_STORE_V2",
    },
  }),

  ...overrides,
});

const buildContext = (
  service,
  operationId = "getProduct"
) =>
  service.buildAiTestSuggestionContext({
    ownerId: PROJECT_ID,
    projectId: PROJECT_ID,
    reportId: REPORT_ID,
    operationId,
  });

describe("AI test suggestion context service", () => {
  it("builds context containing only the selected getProduct operation", async () => {
    const dependencies = createDependencies();

    const service =
      createAiTestSuggestionContextService(dependencies);

    const result = await buildContext(
      service,
      "getProduct"
    );

    expect(result.contextVersion).toBe(
      AI_TEST_SUGGESTION_CONTEXT_VERSION
    );

    expect(result.contextVersion).toBe(
      "DEMO_STORE_AI_CONTEXT_V2"
    );

    expect(result.baselineVersionId).toBe(BASELINE_ID);
    expect(result.selectedOperationId).toBe("getProduct");

    expect(result.operationsByOperationId).toHaveProperty(
      "getProduct"
    );

    expect(result.operationsByOperationId)
      .not.toHaveProperty("listProducts");

    expect(
      result.operationsByOperationId.getProduct.operationKey
    ).toBe(operations[1].operationKey);

    expect(result.modelContext.comparison.baseline).toEqual({
      fixtureId: "DEMO_STORE_V1",
      apiVersion: "1.0.0",
    });

    expect(result.modelContext.comparison.candidate).toEqual({
      fixtureId: "DEMO_STORE_V2",
      apiVersion: "2.0.0",
    });

    expect(result.modelContext.operations).toEqual([
      {
        operationId: "getProduct",
        method: "GET",
        path: "/products/{productId}",
        pathParameters: ["productId"],
        queryParameters: [],
      },
    ]);

    expect(
      result.modelContext.compatibilityFindings
    ).toHaveLength(1);

    expect(
      result.modelContext.compatibilityFindings[0].path
    ).toBe("/products/{productId}");

    const serialized = JSON.stringify(result.modelContext);

    expect(serialized).not.toContain("/products\"");
    expect(serialized).not.toContain(operations[0].operationKey);
    expect(serialized).not.toContain(operations[1].operationKey);
    expect(serialized).not.toContain("sourceText");
    expect(serialized).not.toContain("contentHash");

    expect(
      dependencies.fixtureVerifier
    ).toHaveBeenCalledOnce();
  });

  it("builds context containing only the selected listProducts operation", async () => {
    const dependencies = createDependencies();

    const service =
      createAiTestSuggestionContextService(dependencies);

    const result = await buildContext(
      service,
      "listProducts"
    );

    expect(result.selectedOperationId).toBe("listProducts");

    expect(result.operationsByOperationId).toHaveProperty(
      "listProducts"
    );

    expect(result.operationsByOperationId)
      .not.toHaveProperty("getProduct");

    expect(result.modelContext.operations).toEqual([
      {
        operationId: "listProducts",
        method: "GET",
        path: "/products",
        pathParameters: [],
        queryParameters: ["limit"],
      },
    ]);

    expect(
      result.modelContext.compatibilityFindings
    ).toHaveLength(1);

    expect(
      result.modelContext.compatibilityFindings[0].path
    ).toBe("/products");
  });

  it("rejects unsupported operation selections before loading the report", async () => {
    const dependencies = createDependencies();

    const service =
      createAiTestSuggestionContextService(dependencies);

    await expect(
      buildContext(service, "deleteProduct")
    ).rejects.toMatchObject({
      code: "AI_OPERATION_UNSUPPORTED",
      statusCode: 422,
    });

    expect(
      dependencies.reportService.getDiffReport
    ).not.toHaveBeenCalled();
  });

  it("rejects partial comparison reports", async () => {
    const dependencies = createDependencies({
      reportService: {
        getDiffReport: vi.fn().mockResolvedValue({
          ...report,
          analysisStatus: "PARTIAL",
        }),
      },
    });

    const service =
      createAiTestSuggestionContextService(dependencies);

    await expect(
      buildContext(service, "getProduct")
    ).rejects.toMatchObject({
      code: "AI_SUGGESTIONS_UNSUPPORTED_COMPARISON",
      statusCode: 422,
    });

    expect(
      dependencies.fixtureVerifier
    ).not.toHaveBeenCalled();
  });

  it("rejects report hashes that do not match the stored specifications", async () => {
    const dependencies = createDependencies({
      reportService: {
        getDiffReport: vi.fn().mockResolvedValue({
          ...report,
          baselineContentHash: "c".repeat(64),
        }),
      },
    });

    const service =
      createAiTestSuggestionContextService(dependencies);

    await expect(
      buildContext(service, "getProduct")
    ).rejects.toMatchObject({
      code: "AI_SUGGESTIONS_UNSUPPORTED_COMPARISON",
    });
  });

  it("rejects unrecognized fixture pairs", async () => {
    const dependencies = createDependencies({
      fixtureVerifier: vi.fn().mockReturnValue({
        eligible: false,
      }),
    });

    const service =
      createAiTestSuggestionContextService(dependencies);

    await expect(
      buildContext(service, "getProduct")
    ).rejects.toMatchObject({
      code: "AI_SUGGESTIONS_UNSUPPORTED_COMPARISON",
    });
  });

  it("rejects a selected operation missing from the trusted baseline", async () => {
    const dependencies = createDependencies({
      explorerService: {
        listSpecificationOperations: vi.fn().mockResolvedValue({
          operations: [operations[0]],
        }),
      },
    });

    const service =
      createAiTestSuggestionContextService(dependencies);

    await expect(
      buildContext(service, "getProduct")
    ).rejects.toMatchObject({
      code: "AI_SUGGESTIONS_UNSUPPORTED_COMPARISON",
      statusCode: 422,
    });
  });

  it("rejects duplicate matching operations in the baseline", async () => {
    const dependencies = createDependencies({
      explorerService: {
        listSpecificationOperations: vi.fn().mockResolvedValue({
          operations: [
            operations[1],
            operations[1],
          ],
        }),
      },
    });

    const service =
      createAiTestSuggestionContextService(dependencies);

    await expect(
      buildContext(service, "getProduct")
    ).rejects.toMatchObject({
      code: "AI_SUGGESTIONS_UNSUPPORTED_COMPARISON",
    });
  });

  it("rejects a specification belonging to another project", async () => {
    const dependencies = createDependencies({
      specificationService: {
        getSpecificationVersionRecord: vi.fn(
          async (_ownerId, id) => ({
            ...(id === BASELINE_ID ? baseline : candidate),
            projectId: "507f1f77bcf86cd799439099",
          })
        ),
      },
    });

    const service =
      createAiTestSuggestionContextService(dependencies);

    await expect(
      buildContext(service, "getProduct")
    ).rejects.toMatchObject({
      code: "AI_SUGGESTIONS_UNSUPPORTED_COMPARISON",
    });
  });
});
