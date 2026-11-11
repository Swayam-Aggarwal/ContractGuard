
import { describe, expect, it } from "vitest";

import addTestCoverage from "../src/services/traceability.service.js";

const OPERATION_A = `op_${"a".repeat(43)}`;
const OPERATION_B = `op_${"b".repeat(43)}`;

const createCase = (id, operationKey, status) => ({
  _id: id,
  operationKey,
  operationPath: operationKey === OPERATION_A ? "/records" : "/records/{id}",
  title: `Case ${id}`,
  source: "MANUAL",
  status,
});

const createReport = () => ({
  changes: [
    {
      changeId: "change-covered",
      operationKey: OPERATION_A,
      affectedOperationKeys: [OPERATION_A],
    },
    {
      changeId: "change-draft",
      operationKey: OPERATION_A,
      affectedOperationKeys: [OPERATION_A, OPERATION_B],
    },
    {
      changeId: "change-uncovered",
      operationKey: OPERATION_A,
      affectedOperationKeys: [OPERATION_A, OPERATION_B],
    },
    {
      changeId: "change-unmapped",
      affectedOperationKeys: [],
    },
  ],
});

describe("traceability service", () => {
  it("requires every affected operation to have an approved case for COVERED", () => {
    const result = addTestCoverage(createReport(), [
      createCase("1", OPERATION_A, "APPROVED"),
      createCase("2", OPERATION_A, "DRAFT"),
      createCase("3", OPERATION_B, "ARCHIVED"),
    ]);

    expect(result.changes[0].testCoverage.coverageStatus).toBe("COVERED");
    expect(result.changes[1].testCoverage.coverageStatus).toBe("UNCOVERED");
    expect(result.changes[2].testCoverage.coverageStatus).toBe("UNCOVERED");
    expect(result.changes[3].testCoverage.coverageStatus).toBe("UNMAPPED");
    expect(result.changes[3].testCoverage.totalLinkedTestCases).toBe(0);
    expect(result.coverageSummary).toEqual({
      totalChanges: 4,
      affectedChanges: 3,
      coveredChanges: 1,
      draftOnlyChanges: 0,
      uncoveredChanges: 2,
      unmappedChanges: 1,
    });
  });

  it("distinguishes draft-only from a missing operation case", () => {
    const result = addTestCoverage(createReport(), [
      createCase("1", OPERATION_A, "APPROVED"),
      createCase("2", OPERATION_B, "DRAFT"),
    ]);

    expect(result.changes[1].testCoverage.coverageStatus).toBe("DRAFT_ONLY");
    expect(result.changes[1].testCoverage.coveredOperationCount).toBe(1);
    expect(result.changes[1].testCoverage.draftOnlyOperationCount).toBe(1);
    expect(result.changes[2].testCoverage.coverageStatus).toBe("DRAFT_ONLY");
    expect(result.coverageSummary.draftOnlyChanges).toBe(2);
  });


  it("preserves a direct operation link when a legacy affected-key array is empty", () => {
    const result = addTestCoverage(
      {
        changes: [{
          changeId: "legacy-direct",
          operationKey: OPERATION_A,
          affectedOperationKeys: [],
        }],
      },
      [createCase("1", OPERATION_A, "APPROVED")]
    );

    expect(result.changes[0].testCoverage.coverageStatus).toBe("COVERED");
    expect(result.changes[0].affectedOperationKeys).toEqual([]);
  });

  it("does not treat archived cases as coverage and does not mutate the report", () => {
    const report = createReport();
    const originalChangeCount = report.changes.length;

    const result = addTestCoverage(report, [
      createCase("1", OPERATION_A, "ARCHIVED"),
    ]);

    expect(result.changes[0].testCoverage.coverageStatus).toBe("UNCOVERED");
    expect(report.changes).toHaveLength(originalChangeCount);
    expect(report.changes[0]).not.toHaveProperty("testCoverage");
  });
});
