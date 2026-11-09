
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

  baselineSpecVersionId: new mongoose.Types.ObjectId(),
  candidateSpecVersionId: new mongoose.Types.ObjectId(),

  baselineContentHash: "a".repeat(64),
  candidateContentHash: "b".repeat(64),

  baselineLabel: "v1",
  candidateLabel: "v2",

  analyzerVersion: "1.0.0",
  analysisFingerprint: "c".repeat(64),

  analysisStatus: "COMPLETE",

  summary: {
    totalChanges: 0,
    breakingChanges: 0,
    nonBreakingChanges: 0,
    informationalChanges: 0,
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
          addedOperations: 0,
          removedOperations: 1,
          unchangedOperations: 0,
        },

        changes: [
          {
            category: "operation",
            changeType: "OPERATION_REMOVED",
            severity: "BREAKING",
            breaking: true,
            method: "GET",
            path: "/products",
            field: "operation",
            message: "The candidate removes GET /products.",
          },
        ],
      })
    );

    await report.validate();

    expect(report.changes).toHaveLength(1);
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
});
