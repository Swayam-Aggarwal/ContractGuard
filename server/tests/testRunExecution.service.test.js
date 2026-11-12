import { describe, expect, it } from "vitest";

import {
  testRunExecutionInternals,
} from "../src/services/testRunExecution.service.js";

const result = (status) => ({ status });

describe("test-run execution helpers", () => {
  it("counts each supported individual result state", () => {
    const summary = testRunExecutionInternals.summarizeTestResults(
      [
        result("PASSED"),
        result("FAILED"),
        result("SKIPPED"),
        result("UNSUPPORTED"),
        result("ERROR"),
      ],
      5
    );

    expect(summary).toEqual({
      total: 5,
      passed: 1,
      failed: 1,
      skipped: 1,
      unsupported: 1,
      errors: 1,
    });
  });

  it("derives aggregate run status without hiding failures", () => {
    expect(
      testRunExecutionInternals.getFinalRunStatus({
        failed: 1,
        errors: 0,
        skipped: 0,
        unsupported: 0,
      })
    ).toBe("FAILED");

    expect(
      testRunExecutionInternals.getFinalRunStatus({
        failed: 0,
        errors: 0,
        skipped: 1,
        unsupported: 0,
      })
    ).toBe("PARTIAL");

    expect(
      testRunExecutionInternals.getFinalRunStatus({
        total: 0,
        passed: 0,
        failed: 0,
        errors: 0,
        skipped: 0,
        unsupported: 0,
      })
    ).toBe("PASSED");
  });

  it("bounds stored response evidence while retaining a preview", () => {
    const largeBody = {
      value: "x".repeat(17000),
    };

    const evidence =
      testRunExecutionInternals.toBoundedResponseEvidence(largeBody);

    expect(evidence.responseBody).toBeNull();
    expect(evidence.responseBodyTruncated).toBe(true);

    expect(
      Buffer.byteLength(evidence.responsePreview, "utf8")
    ).toBeLessThanOrEqual(16 * 1024);
  });

  it("rejects a response body beyond the hard response limit", () => {
    const hugeBody = {
      value: "x".repeat(257 * 1024),
    };

    expect(() =>
      testRunExecutionInternals.toBoundedResponseEvidence(hugeBody)
    ).toThrow(/maximum response-body size/u);
  });

  it("creates an explicit skipped result after the total deadline", () => {
    const skipped = testRunExecutionInternals.createSkippedResult(
      {
        testCaseId: "507f1f77bcf86cd799439011",
        title: "List products",
        operationKey: `op_${"A".repeat(43)}`,
        operationPath: "/products",
      },
      "Run deadline reached."
    );

    expect(skipped.status).toBe("SKIPPED");
    expect(skipped.errorCode).toBe("TEST_RUN_DEADLINE_REACHED");
  });
});