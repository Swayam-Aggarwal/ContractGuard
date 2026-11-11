import mongoose from "mongoose";

import {
  describe,
  expect,
  it,
} from "vitest";

import DiffReport from "../src/models/diffReport.model.js";

const createValidReport = (overrides = {}) => ({
  projectId: new mongoose.Types.ObjectId(),
  createdBy: new mongoose.Types.ObjectId(),

  baselineVersionId: new mongoose.Types.ObjectId(),
  candidateVersionId: new mongoose.Types.ObjectId(),

  baselineContentHash: "a".repeat(64),
  candidateContentHash: "b".repeat(64),

  baselineLabel: "v1",
  candidateLabel: "v2",

  analyzerVersion: "2.0.2",
  analysisFingerprint: "c".repeat(64),

  analysisStatus: "COMPLETE",

  summary: {
    totalChanges: 0,
    breakingChanges: 0,
    nonBreakingChanges: 0,
    informationalChanges: 0,
    breaking: 0,
    potentiallyBreaking: 0,
    nonBreaking: 0,
    informational: 0,
    unsupported: 0,
    addedOperations: 0,
    removedOperations: 0,
    unchangedOperations: 0,
  },

  changes: [],
  warnings: [],

  ...overrides,
});

describe("DiffReport model", () => {
  it("should validate a complete comparison report", async () => {
    const report = new DiffReport(
      createValidReport()
    );

    await expect(report.validate()).resolves.toBeUndefined();
  });

  it("should default analysis status to PARTIAL", async () => {
    const report = new DiffReport(
      createValidReport({
        analysisStatus: undefined,
      })
    );

    await report.validate();

    expect(report.analysisStatus).toBe("PARTIAL");
  });

  it("should reject unsupported analysis statuses", async () => {
    const report = new DiffReport(
      createValidReport({
        analysisStatus: "UNKNOWN",
      })
    );

    await expect(
      report.validate()
    ).rejects.toMatchObject({
      errors: {
        analysisStatus: expect.any(
          mongoose.Error.ValidatorError
        ),
      },
    });
  });

  it("should reject changes with unsupported severity values", async () => {
    const report = new DiffReport(
      createValidReport({
        changes: [
          {
            category: "operation",
            changeType: "OPERATION_REMOVED",
            severity: "CRITICAL",
            breaking: true,
            path: "/products",
            field: "operation",
            message: "Operation removed.",
          },
        ],
      })
    );

    await expect(
      report.validate()
    ).rejects.toMatchObject({
      errors: {
        "changes.0.severity": expect.any(
          mongoose.Error.ValidatorError
        ),
      },
    });
  });

  it("should accept a valid breaking change", async () => {
    const report = new DiffReport(
      createValidReport({
        analysisStatus: "COMPLETE",

        summary: {
          totalChanges: 1,
          breakingChanges: 1,
          nonBreakingChanges: 0,
          informationalChanges: 0,
          breaking: 1,
          potentiallyBreaking: 0,
          nonBreaking: 0,
          informational: 0,
          unsupported: 0,
          addedOperations: 0,
          removedOperations: 1,
          unchangedOperations: 0,
        },

        changes: [
          {
            category: "operation",
            changeType: "OPERATION_REMOVED",
            changeId: "d".repeat(64),
            ruleId: "OP-001",
            classification: "BREAKING",
            severity: "BREAKING",
            breaking: true,
            method: "GET",
            path: "/products",
            operationKey: "GET /products",
            affectedOperationKeys: ["GET /products"],
            jsonPointer: "#/paths/~1products/get",
            summary: "The candidate removes GET /products.",
            rationale: "Existing consumers may call an operation that no longer exists.",
            field: "operation",
            message: "The candidate removes GET /products.",
          },
        ],
      })
    );

    await report.validate();

    expect(report.changes).toHaveLength(1);
  });

  it("should persist a traceable unsupported construct finding", async () => {
    const report = new DiffReport(
      createValidReport({
        analysisStatus: "PARTIAL",
        summary: {
          totalChanges: 1,
          breakingChanges: 0,
          nonBreakingChanges: 0,
          informationalChanges: 0,
          breaking: 0,
          potentiallyBreaking: 0,
          nonBreaking: 0,
          informational: 0,
          unsupported: 1,
          addedOperations: 0,
          removedOperations: 0,
          unchangedOperations: 0,
        },
        changes: [
          {
            category: "schema",
            changeType: "ANALYSIS_UNSUPPORTED_CONSTRUCT",
            changeId: "e".repeat(64),
            ruleId: "SCH-001",
            classification: "UNSUPPORTED",
            severity: "INFO",
            breaking: false,
            path: "/products",
            method: "GET",
            operationKey: "GET /products",
            affectedOperationKeys: ["GET /products"],
            jsonPointer: "#/paths/~1products/get/responses/200",
            summary: "An unsupported schema construct needs review.",
            rationale: "The ruleset cannot evaluate the construct completely.",
            field: "responses.200.schema.oneOf",
            message: "Changed oneOf semantics require manual review.",
          },
        ],
      })
    );

    await expect(report.validate()).resolves.toBeUndefined();
    expect(report.changes[0].ruleId).toBe("SCH-001");
    expect(report.summary.unsupported).toBe(1);
  });

  it("should enforce the maximum number of changes", async () => {
    const changes = Array.from(
      { length: 2001 },
      (_, index) => ({
        category: "operation",
        changeType: "OPERATION_ADDED",
        severity: "NON_BREAKING",
        breaking: false,
        path: `/items/${index}`,
        field: "operation",
        message: "Operation added.",
      })
    );

    const report = new DiffReport(
      createValidReport({
        changes,
      })
    );

    await expect(
      report.validate()
    ).rejects.toMatchObject({
      errors: {
        changes: expect.any(
          mongoose.Error.ValidatorError
        ),
      },
    });
  });

  it("should mark report changes as immutable", () => {
    expect(
      DiffReport.schema.path("changes")?.options.immutable
    ).toBe(true);
  });

  it("should mark report warnings as immutable", () => {
    expect(
      DiffReport.schema.path("warnings")?.options.immutable
    ).toBe(true);
  });

  it("should mark analysis status as immutable", () => {
    expect(
      DiffReport.schema.path("analysisStatus")?.options.immutable
    ).toBe(true);
  });

  it("should define the unique report fingerprint index", () => {
    const index = DiffReport.schema.indexes().find(
      ([keys, options]) =>
        keys.projectId === 1 &&
        keys.analysisFingerprint === 1 &&
        options.unique === true
    );

    expect(index).toBeDefined();
  });

  it("should index canonical version references with the ruleset version", () => {
    const index = DiffReport.schema.indexes().find(
      ([keys]) =>
        keys.baselineVersionId === 1 &&
        keys.candidateVersionId === 1 &&
        keys.rulesetVersion === 1
    );

    expect(index).toBeDefined();
  });

  it("should accept all five compatibility classifications and three statuses", async () => {
    for (const classification of [
      "BREAKING",
      "POTENTIALLY_BREAKING",
      "NON_BREAKING",
      "INFORMATIONAL",
      "UNSUPPORTED",
    ]) {
      const report = new DiffReport(
        createValidReport({
          summary: {
            totalChanges: 1,
            breakingChanges: classification === "BREAKING" ? 1 : 0,
            nonBreakingChanges: classification === "NON_BREAKING" ? 1 : 0,
            informationalChanges: classification === "INFORMATIONAL" ? 1 : 0,
            breaking: classification === "BREAKING" ? 1 : 0,
            potentiallyBreaking: classification === "POTENTIALLY_BREAKING" ? 1 : 0,
            nonBreaking: classification === "NON_BREAKING" ? 1 : 0,
            informational: classification === "INFORMATIONAL" ? 1 : 0,
            unsupported: classification === "UNSUPPORTED" ? 1 : 0,
          },
          changes: [
            {
              category: "operation",
              changeType: "CONTRACT_TEST",
              changeId: "e".repeat(64),
              classification,
              severity: classification === "BREAKING" ? "BREAKING" : "INFO",
              breaking: classification === "BREAKING",
              path: "/products",
              field: "operation",
              message: "Contract classification validation.",
              summary: "Contract classification validation.",
              rationale: "Validation fixture.",
            },
          ],
        })
      );

      await expect(report.validate()).resolves.toBeUndefined();
    }

    for (const analysisStatus of ["COMPLETE", "PARTIAL", "FAILED"]) {
      const report = new DiffReport(
        createValidReport({ analysisStatus })
      );

      await expect(report.validate()).resolves.toBeUndefined();
    }
  });

  it("should persist the fixed direction and ruleset version", async () => {
    const report = new DiffReport(createValidReport());

    await report.validate();

    expect(report.direction).toBe(
      "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER"
    );
    expect(report.rulesetVersion).toBe("CG-COMPAT-1.1");
  });

});