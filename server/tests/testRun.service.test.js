import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  getOriginalSourceHash,
  verifyTrustedFixturePair,
} from "../src/services/fixture-registry.service.js";

import {
  testRunServiceInternals,
} from "../src/services/testRun.service.js";

const baselineSource = readFileSync(
  fileURLToPath(
    new URL("../../examples/demo-store-v1.yaml", import.meta.url)
  ),
  "utf8"
);

const candidateSource = readFileSync(
  fileURLToPath(
    new URL("../../examples/demo-store-v2.yaml", import.meta.url)
  ),
  "utf8"
);

const createSpecification = (
  sourceText,
  version,
  projectId = "507f1f77bcf86cd799439011"
) => ({
  _id: version === "1.0.0"
    ? "507f1f77bcf86cd799439012"
    : "507f1f77bcf86cd799439013",
  projectId,
  contentHash: getOriginalSourceHash(sourceText),
  sourceText,
  sourceFormat: "yaml",
  title: "Demo Store API",
  parseStatus: "VALID",
  document: {
    openapi: "3.0.3",
    info: {
      title: "Demo Store API",
      version,
    },
    paths: {
      "/products": {
        get: {
          operationId: "listProducts",
        },
      },
      "/products/{productId}": {
        get: {
          operationId: "getProduct",
        },
      },
    },
  },
});

describe("test-run service domain helpers", () => {
  it("marks only the complete trusted V1-to-V2 comparison as eligible", () => {
    const baseline = createSpecification(
      baselineSource,
      "1.0.0"
    );

    const candidate = createSpecification(
      candidateSource,
      "2.0.0"
    );

    const eligibility = testRunServiceInternals.getEligibility({
      report: {
        direction: "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
        analysisStatus: "COMPLETE",
        baselineContentHash: baseline.contentHash,
        candidateContentHash: candidate.contentHash,
      },
      baseline,
      candidate,
    });

    expect(eligibility.eligible).toBe(true);
    expect(eligibility.supportedOperations).toHaveLength(2);

    expect(
      eligibility.supportedOperations.map((entry) => entry.path)
    ).toEqual([
      "/products",
      "/products/{productId}",
    ]);
  });

  it("blocks partial comparison reports", () => {
    const baseline = createSpecification(
      baselineSource,
      "1.0.0"
    );

    const candidate = createSpecification(
      candidateSource,
      "2.0.0"
    );

    const eligibility = testRunServiceInternals.getEligibility({
      report: {
        direction: "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
        analysisStatus: "PARTIAL",
        baselineContentHash: baseline.contentHash,
        candidateContentHash: candidate.contentHash,
      },
      baseline,
      candidate,
    });

    expect(eligibility.eligible).toBe(false);

    expect(
      eligibility.reasons.some(
        (entry) => entry.code === "COMPARISON_ANALYSIS_NOT_COMPLETE"
      )
    ).toBe(true);
  });

  it("does not list operations absent from either side of comparison", () => {
    const operations = testRunServiceInternals.findSupportedOperations(
      {
        openapi: "3.0.3",
        paths: {
          "/products": {
            get: {},
          },
        },
      },
      {
        openapi: "3.0.3",
        paths: {
          "/other": {
            get: {},
          },
        },
      }
    );

    expect(operations).toEqual([]);
  });

  it("creates an execution snapshot only for an allowed operation", () => {
    const snapshot = testRunServiceInternals.createCaseSnapshot(
      {
        _id: "507f1f77bcf86cd799439014",
        title: "List products",
        operationKey: `op_${"A".repeat(43)}`,
        operationPath: "/products",
        request: {
          pathParams: new Map(),
          queryParams: new Map([["limit", "10"]]),
        },
        assertions: {
          expectedStatus: 200,
        },
      },
      [{
        method: "GET",
        path: "/products",
        operationKey: `op_${"A".repeat(43)}`,
      }]
    );

    expect(snapshot.request.queryParams).toEqual({
      limit: "10",
    });

    expect(snapshot.assertions.expectedStatus).toBe(200);
  });

  it("rejects a test case targeting an operation outside the bundled adapter", () => {
    expect(() =>
      testRunServiceInternals.createCaseSnapshot(
        {
          _id: "507f1f77bcf86cd799439014",
          title: "Delete product",
          operationKey: `op_${"A".repeat(43)}`,
          operationPath: "/products/{productId}",
          request: {
            pathParams: { productId: "1001" },
            queryParams: {},
          },
          assertions: {},
        },
        []
      )
    ).toThrow(/not supported/u);
  });
});