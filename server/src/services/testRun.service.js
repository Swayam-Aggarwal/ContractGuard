import mongoose from "mongoose";

import Project from "../models/project.model.js";
import SpecVersion from "../models/specVersion.model.js";
import DiffReport from "../models/diffReport.model.js";
import TestCase from "../models/testCase.model.js";
import TestRun from "../models/testRun.model.js";

import createOperationIndex from "./openapi-operation-index.service.js";
import specificationExplorerService from "./specification-explorer.service.js";

import {
  SUPPORTED_DEMO_STORE_OPERATIONS,
  verifyTrustedFixturePair,
} from "./fixture-registry.service.js";

import {
  enqueueTestRun,
  recoverInterruptedTestRuns,
  reserveTestRunQueueSlot,
} from "./testRunExecution.service.js";

import AppError from "../utils/appError.js";

const MAX_TEST_CASES_PER_RUN = 20;
const DEFAULT_HISTORY_LIMIT = 20;

const isValidObjectId = (value) =>
  mongoose.isObjectIdOrHexString(value);

const createNotFoundError = () =>
  new AppError("Resource not found.", {
    statusCode: 404,
    code: "RESOURCE_NOT_FOUND",
  });

const createValidationError = (
  message,
  field = "testCaseIds"
) =>
  new AppError(message, {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    details: [{ field, message }],
  });

const createEligibilityError = (reasons = []) =>
  new AppError(
    reasons[0]?.message ??
      "This comparison is not eligible for regression execution.",
    {
      statusCode: 409,
      code: "TEST_RUN_NOT_ELIGIBLE",
      details: reasons.map((reason) => ({
        field: reason.code,
        message: reason.message,
      })),
    }
  );

const toPlainRecord = (value) => {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }

  if (value && typeof value.toObject === "function") {
    return value.toObject({ flattenMaps: true });
  }

  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? { ...value }
    : {};
};

const toObjectIdString = (value) =>
  value === null || value === undefined
    ? null
    : String(value);

const toPublicSummary = (summary = {}) => ({
  total: summary.total ?? 0,
  passed: summary.passed ?? 0,
  failed: summary.failed ?? 0,
  skipped: summary.skipped ?? 0,
  unsupported: summary.unsupported ?? 0,
  errors: summary.errors ?? summary.errorCount ?? 0,
});

const toPublicSchemaValidation = (validation) => {
  if (!validation) return validation;

  const {
    validationErrors,
    errors,
    ...remaining
  } = validation;

  return {
    ...remaining,
    errors: validationErrors ?? errors ?? [],
  };
};

const toPublicResult = (result) => ({
  testCaseId: toObjectIdString(result.testCaseId),
  title: result.title,
  operationKey: result.operationKey,
  operationPath: result.operationPath,
  status: result.status,
  expectedStatus: result.expectedStatus ?? null,
  actualStatus: result.actualStatus ?? null,
  contentType: result.contentType ?? null,
  durationMs: result.durationMs ?? 0,
  candidateSchemaValidation: toPublicSchemaValidation(
    result.candidateSchemaValidation
  ),
  baselineSchemaValidation: toPublicSchemaValidation(
    result.baselineSchemaValidation
  ),
  assertions: result.assertions ?? [],
  responseBody: result.responseBody ?? null,
  responsePreview: result.responsePreview ?? "",
  responseBodyTruncated:
    result.responseBodyTruncated === true,
  errorCode: result.errorCode ?? null,
  errorMessage: result.errorMessage ?? null,
  startedAt: result.startedAt ?? null,
  completedAt: result.completedAt ?? null,
});

export const toPublicTestRunSummary = (run) => ({
  id: toObjectIdString(run._id ?? run.id),
  projectId: toObjectIdString(run.projectId),
  comparisonId: toObjectIdString(run.comparisonId),
  baselineVersionId: toObjectIdString(
    run.baselineVersionId
  ),
  candidateVersionId: toObjectIdString(
    run.candidateVersionId
  ),
  status: run.status,
  executionTarget: run.executionTarget,
  selectedTestCaseIds: (
    run.selectedTestCaseIds ?? []
  ).map(toObjectIdString),
  selectedTestCaseTitles: (
    run.testCaseSnapshots ?? []
  ).map((entry) => entry.title),
  summary: toPublicSummary(run.summary),
  failureReason: run.failureReason ?? null,
  startedAt: run.startedAt ?? null,
  completedAt: run.completedAt ?? null,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
});

export const toPublicTestRun = (run) => ({
  ...toPublicTestRunSummary(run),
  direction: run.direction,
  rulesetVersion: run.rulesetVersion,
  baselineContentHash: run.baselineContentHash,
  candidateContentHash: run.candidateContentHash,
  testCaseSnapshots: (
    run.testCaseSnapshots ?? []
  ).map((snapshot) => ({
    testCaseId: toObjectIdString(snapshot.testCaseId),
    title: snapshot.title,
    operationKey: snapshot.operationKey,
    operationPath: snapshot.operationPath,
    request: {
      pathParams: toPlainRecord(
        snapshot.request?.pathParams
      ),
      queryParams: toPlainRecord(
        snapshot.request?.queryParams
      ),
    },
    assertions: snapshot.assertions ?? {},
  })),
  results: (run.results ?? []).map(toPublicResult),
});

const verifyProjectOwnership = async (
  ownerId,
  projectId
) => {
  if (
    !isValidObjectId(ownerId) ||
    !isValidObjectId(projectId)
  ) {
    throw createNotFoundError();
  }

  const project = await Project.exists({
    _id: projectId,
    ownerId,
  });

  if (!project) throw createNotFoundError();
};

const getComparisonContext = async (
  ownerId,
  projectId,
  reportId
) => {
  await verifyProjectOwnership(ownerId, projectId);

  if (!isValidObjectId(reportId)) {
    throw createNotFoundError();
  }

  const report = await DiffReport.findOne({
    _id: reportId,
    projectId,
  })
    .lean()
    .exec();

  if (!report) throw createNotFoundError();

  const baselineVersionId =
    report.baselineVersionId ??
    report.baselineSpecVersionId;

  const candidateVersionId =
    report.candidateVersionId ??
    report.candidateSpecVersionId;

  if (
    !isValidObjectId(baselineVersionId) ||
    !isValidObjectId(candidateVersionId)
  ) {
    throw createNotFoundError();
  }

  const specifications = await SpecVersion.find({
    _id: {
      $in: [baselineVersionId, candidateVersionId],
    },
    projectId,
  })
    .lean()
    .exec();

  const baseline = specifications.find(
    (entry) =>
      String(entry._id) === String(baselineVersionId)
  );

  const candidate = specifications.find(
    (entry) =>
      String(entry._id) === String(candidateVersionId)
  );

  if (!baseline || !candidate) {
    throw createNotFoundError();
  }

  return {
    report,
    baseline,
    candidate,
  };
};

const findSupportedOperations = (
  baselineDocument,
  candidateDocument
) => {
  const baselineOperations =
    createOperationIndex(baselineDocument);

  const candidateOperations =
    createOperationIndex(candidateDocument);

  const supported = [];

  for (const allowed of SUPPORTED_DEMO_STORE_OPERATIONS) {
    const baseline = baselineOperations.find(
      (entry) =>
        entry.kind === "path" &&
        entry.method === allowed.method &&
        entry.path === allowed.path
    );

    const candidate = candidateOperations.find(
      (entry) =>
        entry.kind === "path" &&
        entry.method === allowed.method &&
        entry.path === allowed.path
    );

    if (
      baseline &&
      candidate &&
      baseline.operationKey === candidate.operationKey
    ) {
      supported.push({
        method: allowed.method,
        path: allowed.path,
        operationKey: baseline.operationKey,
        summary:
          baseline.summary ??
          candidate.summary ??
          null,
      });
    }
  }

  return supported;
};

const getEligibility = ({
  report,
  baseline,
  candidate,
}) => {
  const fixturePair = verifyTrustedFixturePair({
    baseline,
    candidate,
    direction: report.direction,
  });

  const reasons = [...fixturePair.reasons];

  if (
    report.baselineContentHash !== baseline.contentHash ||
    report.candidateContentHash !== candidate.contentHash
  ) {
    reasons.push({
      code: "COMPARISON_CONTENT_HASH_MISMATCH",
      message:
        "The comparison report does not match the immutable specification content hashes.",
    });
  }

  if (report.analysisStatus !== "COMPLETE") {
    reasons.push({
      code: "COMPARISON_ANALYSIS_NOT_COMPLETE",
      message:
        "Only comparisons with complete compatibility analysis can be executed.",
    });
  }

  const supportedOperations = fixturePair.eligible
    ? findSupportedOperations(
        baseline.document,
        candidate.document
      )
    : [];

  if (
    fixturePair.eligible &&
    supportedOperations.length === 0
  ) {
    reasons.push({
      code: "NO_SUPPORTED_OPERATIONS",
      message:
        "The trusted specification pair does not expose any supported regression operations.",
    });
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    baselineFixture:
      fixturePair.baseline?.fixtureId ?? null,
    candidateFixture:
      fixturePair.candidate?.fixtureId ?? null,
    executionTarget:
      reasons.length === 0
        ? fixturePair.executionTarget
        : null,
    supportedOperations,
  };
};

const getEligibleTestCaseRecords = async ({
  projectId,
  baselineVersionId,
  testCaseIds,
}) => {
  if (
    !Array.isArray(testCaseIds) ||
    testCaseIds.length < 1 ||
    testCaseIds.length > MAX_TEST_CASES_PER_RUN
  ) {
    throw createValidationError(
      `Select between 1 and ${MAX_TEST_CASES_PER_RUN} approved test cases.`
    );
  }

  if (testCaseIds.some((id) => !isValidObjectId(id))) {
    throw createValidationError(
      "Every selected test-case ID must be a valid ObjectId."
    );
  }

  const normalizedIds = testCaseIds.map(
    (id) => String(id).toLowerCase()
  );

  if (
    new Set(normalizedIds).size !== normalizedIds.length
  ) {
    throw createValidationError(
      "A test case cannot be selected more than once."
    );
  }

  const records = await TestCase.find({
    _id: {
      $in: testCaseIds,
    },
    projectId,
    specVersionId: baselineVersionId,
    status: "APPROVED",
    source: "MANUAL",
  })
    .lean()
    .exec();

  if (records.length !== testCaseIds.length) {
    throw new AppError(
      "Every selected case must be a manually authored, approved test case belonging to this project's exact baseline specification.",
      {
        statusCode: 409,
        code: "TEST_RUN_TEST_CASE_INELIGIBLE",
      }
    );
  }

  const byId = new Map(
    records.map((record) => [
      String(record._id).toLowerCase(),
      record,
    ])
  );

  return testCaseIds.map(
    (id) => byId.get(String(id).toLowerCase())
  );
};

const createCaseSnapshot = (
  record,
  supportedOperations
) => {
  const operation = supportedOperations.find(
    (entry) =>
      entry.operationKey === record.operationKey &&
      entry.path === record.operationPath
  );

  if (!operation) {
    throw new AppError(
      `Test case '${record.title}' targets an operation that is not supported by the bundled runner.`,
      {
        statusCode: 422,
        code: "TEST_RUN_OPERATION_UNSUPPORTED",
      }
    );
  }

  return {
    testCaseId: record._id,
    title: record.title,
    operationKey: record.operationKey,
    operationPath: record.operationPath,
    request: {
      pathParams: toPlainRecord(
        record.request?.pathParams
      ),
      queryParams: toPlainRecord(
        record.request?.queryParams
      ),
    },
    assertions: record.assertions ?? {},
  };
};

const getTestRunRecord = async (
  ownerId,
  projectId,
  reportId,
  testRunId
) => {
  await verifyProjectOwnership(ownerId, projectId);

  if (
    !isValidObjectId(reportId) ||
    !isValidObjectId(testRunId)
  ) {
    throw createNotFoundError();
  }

  const run = await TestRun.findOne({
    _id: testRunId,
    ownerId,
    projectId,
    comparisonId: reportId,
  })
    .lean()
    .exec();

  if (!run) throw createNotFoundError();

  return run;
};

const listTestRuns = async (
  ownerId,
  projectId,
  reportId
) => {
  const context = await getComparisonContext(
    ownerId,
    projectId,
    reportId
  );

  const eligibility = getEligibility(context);

  const records = await TestRun.find({
    ownerId,
    projectId,
    comparisonId: context.report._id,
  })
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(DEFAULT_HISTORY_LIMIT)
    .lean()
    .exec();

  return {
    executionEligibility: eligibility,
    testRuns: records.map(toPublicTestRunSummary),
  };
};

const createTestRun = async (
  ownerId,
  projectId,
  reportId,
  input
) => {
  const context = await getComparisonContext(
    ownerId,
    projectId,
    reportId
  );

  const eligibility = getEligibility(context);

  if (!eligibility.eligible) {
    throw createEligibilityError(
      eligibility.reasons
    );
  }

  const selectedCases = await getEligibleTestCaseRecords({
    projectId: context.report.projectId,
    baselineVersionId: context.baseline._id,
    testCaseIds: input.testCaseIds,
  });

  const snapshots = [];

  for (const record of selectedCases) {
    const [
      baselineDetail,
      candidateDetail,
    ] = await Promise.all([
      specificationExplorerService.getSpecificationOperation(
        ownerId.toString(),
        context.baseline._id.toString(),
        record.operationKey
      ),
      specificationExplorerService.getSpecificationOperation(
        ownerId.toString(),
        context.candidate._id.toString(),
        record.operationKey
      ),
    ]);

    if (
      baselineDetail.operation.kind !== "path" ||
      candidateDetail.operation.kind !== "path" ||
      baselineDetail.operation.method !== "GET" ||
      candidateDetail.operation.method !== "GET" ||
      baselineDetail.operation.path !== record.operationPath ||
      candidateDetail.operation.path !== record.operationPath
    ) {
      throw new AppError(
        `Test case '${record.title}' does not map to the same supported GET operation in both trusted specifications.`,
        {
          statusCode: 422,
          code: "TEST_RUN_OPERATION_UNSUPPORTED",
        }
      );
    }

    snapshots.push(
      createCaseSnapshot(
        record,
        eligibility.supportedOperations
      )
    );
  }

  const releaseQueueReservation =
    reserveTestRunQueueSlot();

  let createdRun;

  try {
    createdRun = await TestRun.create({
      ownerId,
      projectId: context.report.projectId,
      comparisonId: context.report._id,
      baselineVersionId: context.baseline._id,
      candidateVersionId: context.candidate._id,
      baselineContentHash: context.baseline.contentHash,
      candidateContentHash: context.candidate.contentHash,
      direction: context.report.direction,
      rulesetVersion: context.report.rulesetVersion,
      executionTarget: eligibility.executionTarget,
      selectedTestCaseIds: selectedCases.map(
        (record) => record._id
      ),
      testCaseSnapshots: snapshots,
      status: "QUEUED",
      summary: {
        total: snapshots.length,
        passed: 0,
        failed: 0,
        skipped: 0,
        unsupported: 0,
        errorCount: 0,
      },
      results: [],
    });

    releaseQueueReservation();

    enqueueTestRun(createdRun._id.toString());
  } catch (error) {
    releaseQueueReservation();

    if (createdRun?._id) {
      const now = new Date();

      const queueFailureResults = snapshots.map(
        (snapshot) => ({
          testCaseId: snapshot.testCaseId,
          title: snapshot.title,
          operationKey: snapshot.operationKey,
          operationPath: snapshot.operationPath,
          status: "ERROR",
          expectedStatus:
            snapshot.assertions?.expectedStatus ?? null,
          actualStatus: null,
          contentType: null,
          durationMs: 0,
          candidateSchemaValidation: {
            status: "NOT_CHECKED",
            valid: null,
            validationErrors: [],
            warnings: [],
          },
          baselineSchemaValidation: {
            status: "NOT_CHECKED",
            valid: null,
            validationErrors: [],
            warnings: [],
          },
          assertions: [],
          responseBody: null,
          responsePreview: "",
          responseBodyTruncated: false,
          errorCode: "TEST_RUN_QUEUE_ERROR",
          errorMessage:
            "The run could not be added to the in-process execution queue.",
          startedAt: now,
          completedAt: now,
        })
      );

      await TestRun.updateOne(
        {
          _id: createdRun._id,
          status: "QUEUED",
        },
        {
          $set: {
            status: "FAILED",
            results: queueFailureResults,
            summary: {
              total: snapshots.length,
              passed: 0,
              failed: 0,
              skipped: 0,
              unsupported: 0,
              errorCount: snapshots.length,
            },
            startedAt: now,
            completedAt: now,
            failureReason:
              "The run could not be added to the in-process execution queue.",
          },
        },
        { runValidators: true }
      ).exec();
    }

    throw error;
  }

  return toPublicTestRun(createdRun);
};

const getTestRun = async (
  ownerId,
  projectId,
  reportId,
  testRunId
) => {
  const run = await getTestRunRecord(
    ownerId,
    projectId,
    reportId,
    testRunId
  );

  return toPublicTestRun(run);
};

const testRunService = {
  listTestRuns,
  createTestRun,
  getTestRun,
  recoverInterruptedTestRuns,
};

export default testRunService;

export { recoverInterruptedTestRuns };

export const testRunServiceInternals = Object.freeze({
  getEligibility,
  findSupportedOperations,
  createCaseSnapshot,
  toPublicTestRunSummary,
  toPublicTestRun,
});