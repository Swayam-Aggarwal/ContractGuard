import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createAiGeneratedTestCasePersistenceService,
} from "../src/services/ai-generated-test-case-persistence.service.js";

const PROJECT_ID = "507f1f77bcf86cd799439011";
const BASELINE_ID = "507f1f77bcf86cd799439012";

const LIST_PRODUCTS_KEY = `op_${"a".repeat(43)}`;
const GET_PRODUCT_KEY = `op_${"b".repeat(43)}`;

const createFakeModel = (initialCount = 0) => {
  const inserted = [];

  class FakeTestCaseModel {
    constructor(values) {
      Object.assign(this, values);

      this._id = {
        toString: () =>
          `507f1f77bcf86cd7994390${inserted.length + 1}`.slice(-24),
      };

      this.createdAt = new Date();
      this.updatedAt = new Date();
    }

    async validate() {
      return undefined;
    }

    static countDocuments() {
      return {
        exec: async () => initialCount + inserted.length,
      };
    }

    static async insertMany(documents) {
      inserted.push(...documents);
      return documents;
    }
  }

  return {
    FakeTestCaseModel,
    inserted,
  };
};

const listProductsOperation = {
  operationKey: LIST_PRODUCTS_KEY,
  operationId: "listProducts",
  kind: "path",
  method: "GET",
  path: "/products",
  parameters: [
    {
      name: "limit",
      in: "query",
      required: false,
      schema: {
        type: "integer",
        minimum: 1,
        maximum: 50,
      },
    },
  ],
};

const getProductOperation = {
  operationKey: GET_PRODUCT_KEY,
  operationId: "getProduct",
  kind: "path",
  method: "GET",
  path: "/products/{productId}",
  parameters: [
    {
      name: "productId",
      in: "path",
      required: true,
      schema: {
        type: "string",
      },
    },
  ],
};

const createPersistence = ({
  initialCount = 0,
} = {}) => {
  const {
    FakeTestCaseModel,
    inserted,
  } = createFakeModel(initialCount);

  const specificationService = {
    getSpecificationVersionRecord: vi.fn()
      .mockResolvedValue({
        _id: BASELINE_ID,
        projectId: PROJECT_ID,
      }),
  };

  const explorerService = {
    getSpecificationOperation: vi.fn(
      async (_ownerId, _versionId, operationKey) => ({
        operation: operationKey === LIST_PRODUCTS_KEY
          ? listProductsOperation
          : getProductOperation,
      })
    ),
  };

  const service =
    createAiGeneratedTestCasePersistenceService({
      TestCaseModel: FakeTestCaseModel,
      specificationService,
      explorerService,
      serializeTestCase: (record) => record,
    });

  return {
    service,
    inserted,
    specificationService,
    explorerService,
  };
};

const generationMetadata = {
  provider: "Google Gemini",
  model: "gemini-3.8-flash",
  generatedAt: new Date("2026-11-12T10:00:00.000Z"),
  contextVersion: "DEMO_STORE_AI_CONTEXT_V2",
  consentVersion: "AI_TEST_SUGGESTION_CONSENT_V2",
  consentedAt: new Date("2026-11-12T09:59:00.000Z"),
};

const getProductCases = [
  {
    title: "Retrieve a known synthetic product",
    rationale:
      "This verifies the standard product retrieval path.",
    testCategory: "HAPPY_PATH",
    pathParams: {
      productId: "1001",
    },
    queryParams: {},
  },

  {
    title: "Request a nonexistent synthetic product",
    rationale:
      "This verifies the documented not-found response path.",
    testCategory: "NEGATIVE",
    pathParams: {
      productId: "9999",
    },
    queryParams: {},
  },
];

describe("AI-generated test-case persistence service", () => {
  it("stores AI suggestions as drafts using canonical baseline operation data", async () => {
    const {
      service,
      inserted,
      explorerService,
    } = createPersistence();

    const result =
      await service.persistAiGeneratedDraftTestCases({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        specVersionId: BASELINE_ID,
        operationId: "getProduct",
        operationKey: GET_PRODUCT_KEY,
        operationPath: "/products/{productId}",
        cases: getProductCases,
        generationMetadata,
      });

    expect(result).toHaveLength(2);
    expect(inserted).toHaveLength(2);

    expect(inserted[0]).toMatchObject({
      operationKey: GET_PRODUCT_KEY,
      operationPath: "/products/{productId}",
      source: "AI",
      status: "DRAFT",
      approvedAt: null,
      assertions: {
        expectedStatus: 200,
        requiredProperties: [
          "id",
          "name",
          "description",
          "price",
          "currency",
          "stock",
        ],
      },
    });

    expect(inserted[1].assertions).toMatchObject({
      expectedStatus: 404,
      requiredProperties: [
        "code",
        "message",
      ],
    });

    expect(inserted[0].generationMetadata).toMatchObject({
      provider: "Google Gemini",
      model: "gemini-3.8-flash",
      consentVersion: "AI_TEST_SUGGESTION_CONSENT_V2",
    });

    expect(
      explorerService.getSpecificationOperation
    ).toHaveBeenCalledWith(
      PROJECT_ID,
      BASELINE_ID,
      GET_PRODUCT_KEY
    );
  });

  it("derives the listProducts required-property assertion from the V1 contract", async () => {
    const {
      service,
      inserted,
    } = createPersistence();

    await service.persistAiGeneratedDraftTestCases({
      ownerId: PROJECT_ID,
      projectId: PROJECT_ID,
      specVersionId: BASELINE_ID,
      operationId: "listProducts",
      operationKey: LIST_PRODUCTS_KEY,
      operationPath: "/products",
      cases: [
        {
          title: "Request the smallest supported page",
          rationale:
            "This verifies the lower limit boundary.",
          testCategory: "BOUNDARY",
          pathParams: {},
          queryParams: {
            limit: "1",
          },
        },
        {
          title: "Use the default product page size",
          rationale:
            "This verifies the documented default behavior.",
          testCategory: "HAPPY_PATH",
          pathParams: {},
          queryParams: {},
        },
      ],
      generationMetadata,
    });

    expect(inserted[0].assertions).toMatchObject({
      expectedStatus: 200,
      requiredProperties: [
        "items",
      ],
    });

    // The V1 contract does not require "total".
    expect(
      inserted[0].assertions.requiredProperties
    ).not.toContain("total");
  });

  it("rejects a product identifier outside the bundled fixture", async () => {
    const {
      service,
      inserted,
    } = createPersistence();

    await expect(
      service.persistAiGeneratedDraftTestCases({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        specVersionId: BASELINE_ID,
        operationId: "getProduct",
        operationKey: GET_PRODUCT_KEY,
        operationPath: "/products/{productId}",
        cases: [
          getProductCases[0],
          {
            ...getProductCases[1],
            pathParams: {
              productId: "5000",
            },
          },
        ],
        generationMetadata,
      })
    ).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(inserted).toHaveLength(0);
  });

  it("rejects a generated parameter that is not declared by the baseline", async () => {
    const {
      service,
      inserted,
    } = createPersistence();

    await expect(
      service.persistAiGeneratedDraftTestCases({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        specVersionId: BASELINE_ID,
        operationId: "listProducts",
        operationKey: LIST_PRODUCTS_KEY,
        operationPath: "/products",
        cases: [
          {
            title: "Unsupported query input",
            rationale:
              "This verifies that unknown parameters are rejected.",
            testCategory: "NEGATIVE",
            pathParams: {},
            queryParams: {
              limit: "10",
              admin: "true",
            },
          },
          {
            title: "Valid query input",
            rationale:
              "This is a valid comparison scenario.",
            testCategory: "HAPPY_PATH",
            pathParams: {},
            queryParams: {
              limit: "20",
            },
          },
        ],
        generationMetadata,
      })
    ).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(inserted).toHaveLength(0);
  });

  it("rejects duplicate request scenarios before insertion", async () => {
    const {
      service,
      inserted,
    } = createPersistence();

    await expect(
      service.persistAiGeneratedDraftTestCases({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        specVersionId: BASELINE_ID,
        operationId: "getProduct",
        operationKey: GET_PRODUCT_KEY,
        operationPath: "/products/{productId}",
        cases: [
          getProductCases[0],
          {
            ...getProductCases[0],
            title: "A different title for the same request",
          },
        ],
        generationMetadata,
      })
    ).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(inserted).toHaveLength(0);
  });

  it("enforces the 500-test-case specification limit", async () => {
    const {
      service,
      inserted,
    } = createPersistence({
      initialCount: 499,
    });

    await expect(
      service.persistAiGeneratedDraftTestCases({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        specVersionId: BASELINE_ID,
        operationId: "getProduct",
        operationKey: GET_PRODUCT_KEY,
        operationPath: "/products/{productId}",
        cases: getProductCases,
        generationMetadata,
      })
    ).rejects.toMatchObject({
      code: "TEST_CASE_LIMIT_EXCEEDED",
    });

    expect(inserted).toHaveLength(0);
  });

  it("rejects incomplete consent audit metadata", async () => {
    const {
      service,
      inserted,
    } = createPersistence();

    await expect(
      service.persistAiGeneratedDraftTestCases({
        ownerId: PROJECT_ID,
        projectId: PROJECT_ID,
        specVersionId: BASELINE_ID,
        operationId: "getProduct",
        operationKey: GET_PRODUCT_KEY,
        operationPath: "/products/{productId}",
        cases: getProductCases,
        generationMetadata: {
          ...generationMetadata,
          consentedAt: undefined,
        },
      })
    ).rejects.toMatchObject({
      code: "AI_TEST_CASE_AUDIT_METADATA_INVALID",
    });

    expect(inserted).toHaveLength(0);
  });
});