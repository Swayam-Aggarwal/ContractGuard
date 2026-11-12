import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import TestRun from "../src/models/testRun.model.js";

const createValidRun = (overrides = {}) => {
  const ownerId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const comparisonId = new mongoose.Types.ObjectId();
  const baselineVersionId = new mongoose.Types.ObjectId();
  const candidateVersionId = new mongoose.Types.ObjectId();
  const testCaseId = new mongoose.Types.ObjectId();

  return new TestRun({
    ownerId,
    projectId,
    comparisonId,
    baselineVersionId,
    candidateVersionId,
    baselineContentHash: "a".repeat(64),
    candidateContentHash: "b".repeat(64),
    direction: "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
    rulesetVersion: "CG-COMPAT-1.1",
    executionTarget: {
      type: "BUNDLED_DEMO_STORE",
      fixtureId: "DEMO_STORE_V2",
      implementationVersion: "DEMO_STORE_V2",
    },
    selectedTestCaseIds: [testCaseId],
    testCaseSnapshots: [{
      testCaseId,
      title: "List products",
      operationKey: `op_${"A".repeat(43)}`,
      operationPath: "/products",
      request: {
        pathParams: {},
        queryParams: {},
      },
      assertions: {
        expectedStatus: 200,
        requiredProperties: [],
      },
    }],
    summary: { total: 1 },
    ...overrides,
  });
};

describe("TestRun model", () => {
  it("accepts a bounded run with an immutable test-case snapshot", async () => {
    const run = createValidRun();

    await expect(run.validate()).resolves.toBeUndefined();

    expect(run.status).toBe("QUEUED");
    expect(run.collection.name).toBe("testruns");
  });

  it("rejects more than 20 selected test cases", async () => {
    const ids = Array.from(
      { length: 21 },
      () => new mongoose.Types.ObjectId()
    );

    const snapshots = ids.map((testCaseId, index) => ({
      testCaseId,
      title: `Case ${index}`,
      operationKey: `op_${"A".repeat(43)}`,
      operationPath: "/products",
      request: {
        pathParams: {},
        queryParams: {},
      },
      assertions: {},
    }));

    const run = createValidRun({
      selectedTestCaseIds: ids,
      testCaseSnapshots: snapshots,
      summary: { total: 21 },
    });

    await expect(run.validate()).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("rejects a summary total that differs from selected test-case count", async () => {
    const run = createValidRun({
      summary: { total: 0 },
    });

    await expect(run.validate()).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("rejects duplicate selected test-case IDs", async () => {
    const testCaseId = new mongoose.Types.ObjectId();

    const snapshot = {
      testCaseId,
      title: "List products",
      operationKey: `op_${"A".repeat(43)}`,
      operationPath: "/products",
      request: {
        pathParams: {},
        queryParams: {},
      },
      assertions: {},
    };

    const run = createValidRun({
      selectedTestCaseIds: [testCaseId, testCaseId],
      testCaseSnapshots: [snapshot, { ...snapshot }],
      summary: { total: 2 },
    });

    await expect(run.validate()).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("rejects a result status outside the supported lifecycle", async () => {
    const run = createValidRun({
      results: [{
        testCaseId: new mongoose.Types.ObjectId(),
        title: "List products",
        operationKey: `op_${"A".repeat(43)}`,
        operationPath: "/products",
        status: "SUCCESS",
      }],
    });

    await expect(run.validate()).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("rejects snapshots whose identity does not match selected IDs", async () => {
    const run = createValidRun({
      testCaseSnapshots: [{
        testCaseId: new mongoose.Types.ObjectId(),
        title: "Different case",
        operationKey: `op_${"A".repeat(43)}`,
        operationPath: "/products",
        request: {
          pathParams: {},
          queryParams: {},
        },
        assertions: {},
      }],
    });

    await expect(run.validate()).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("rejects results for test cases that were not selected", async () => {
    const run = createValidRun({
      results: [{
        testCaseId: new mongoose.Types.ObjectId(),
        title: "Unselected case",
        operationKey: `op_${"A".repeat(43)}`,
        operationPath: "/products",
        status: "PASSED",
      }],
    });

    await expect(run.validate()).rejects.toMatchObject({
      name: "ValidationError",
    });
  });
});