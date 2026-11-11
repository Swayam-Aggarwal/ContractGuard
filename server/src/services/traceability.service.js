
const MAX_PUBLIC_LINKED_CASES = 50;

const getCaseId = (testCase) => String(testCase._id ?? testCase.id);

/**
 * Derives comparison coverage from the current baseline test-case library.
 * This projection is deliberately not persisted inside an immutable report.
 *
 * Coverage is operation-complete: a change is COVERED only when every
 * affected baseline operation has at least one approved case. Drafts never
 * count as approved coverage, and a missing case for even one affected
 * operation keeps the change UNCOVERED.
 */
export const addTestCoverage = (report, testCases = []) => {
  const casesByOperation = new Map();

  for (const testCase of testCases) {
    if (!testCase || testCase.status === "ARCHIVED") continue;

    const operationKey = testCase.operationKey;
    if (typeof operationKey !== "string" || !operationKey) continue;

    const bucket = casesByOperation.get(operationKey) ?? [];
    bucket.push(testCase);
    casesByOperation.set(operationKey, bucket);
  }

  let coveredChanges = 0;
  let draftOnlyChanges = 0;
  let uncoveredChanges = 0;
  let unmappedChanges = 0;

  const changes = (report.changes ?? []).map((change) => {
    const operationKeys = [...new Set([
      ...(Array.isArray(change.affectedOperationKeys)
        ? change.affectedOperationKeys
        : []),
      ...(change.operationKey ? [change.operationKey] : []),
    ].filter((value) => typeof value === "string" && value.length > 0))].sort();

    const linkedById = new Map();
    let coveredOperationCount = 0;
    let draftOnlyOperationCount = 0;
    let uncoveredOperationCount = 0;

    for (const operationKey of operationKeys) {
      const operationCases = casesByOperation.get(operationKey) ?? [];
      const approvedCases = operationCases.filter(
        (testCase) => testCase.status === "APPROVED"
      );
      const draftCases = operationCases.filter(
        (testCase) => testCase.status === "DRAFT"
      );

      if (approvedCases.length > 0) {
        coveredOperationCount += 1;
      } else if (draftCases.length > 0) {
        draftOnlyOperationCount += 1;
      } else {
        uncoveredOperationCount += 1;
      }

      for (const testCase of operationCases) {
        linkedById.set(getCaseId(testCase), testCase);
      }
    }

    const linkedCases = [...linkedById.values()].sort((left, right) =>
      String(left.title ?? "").localeCompare(String(right.title ?? "")) ||
      getCaseId(left).localeCompare(getCaseId(right))
    );

    const approvedCount = linkedCases.filter(
      (testCase) => testCase.status === "APPROVED"
    ).length;
    const draftCount = linkedCases.filter(
      (testCase) => testCase.status === "DRAFT"
    ).length;

    let coverageStatus = "UNMAPPED";

    if (operationKeys.length > 0) {
      if (uncoveredOperationCount > 0) {
        coverageStatus = "UNCOVERED";
      } else if (draftOnlyOperationCount > 0) {
        coverageStatus = "DRAFT_ONLY";
      } else {
        coverageStatus = "COVERED";
      }
    }

    if (coverageStatus === "COVERED") {
      coveredChanges += 1;
    } else if (coverageStatus === "DRAFT_ONLY") {
      draftOnlyChanges += 1;
    } else if (coverageStatus === "UNCOVERED") {
      uncoveredChanges += 1;
    } else {
      unmappedChanges += 1;
    }

    return {
      ...change,
      testCoverage: {
        affectedOperationCount: operationKeys.length,
        coveredOperationCount,
        draftOnlyOperationCount,
        uncoveredOperationCount,
        totalLinkedTestCases: linkedCases.length,
        approvedCount,
        draftCount,
        coverageStatus,
        linkedTestCases: linkedCases
          .slice(0, MAX_PUBLIC_LINKED_CASES)
          .map((testCase) => ({
            id: getCaseId(testCase),
            title: testCase.title,
            status: testCase.status,
            source: testCase.source,
            operationKey: testCase.operationKey,
            operationPath: testCase.operationPath,
          })),
        linkedTestCasesTruncated: linkedCases.length > MAX_PUBLIC_LINKED_CASES,
      },
    };
  });

  return {
    ...report,
    changes,
    coverageSummary: {
      totalChanges: changes.length,
      affectedChanges: coveredChanges + draftOnlyChanges + uncoveredChanges,
      coveredChanges,
      draftOnlyChanges,
      uncoveredChanges,
      unmappedChanges,
    },
  };
};

export default addTestCoverage;
