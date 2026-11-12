import TestRun from "../models/testRun.model.js";
import SpecVersion from "../models/specVersion.model.js";

import specificationExplorerService from "./specification-explorer.service.js";
import { verifyTrustedFixturePair } from "./fixture-registry.service.js";
import { buildTestRunRequest } from "./testRun-request.service.js";
import { executeDemoStoreAdapter } from "./demo-store-adapter.service.js";
import { validateRegressionResponse } from "./testRun-validation.service.js";

import AppError from "../utils/appError.js";

const MAX_WAITING_RUNS = 10;
const MAX_CONCURRENT_RUNS = 2;
const MAX_CONCURRENT_TESTS_PER_RUN = 2;
const PER_TEST_TIMEOUT_MS = 5000;
const TOTAL_RUN_DEADLINE_MS = 60000;
const MAX_RESPONSE_BODY_BYTES = 256 * 1024;
const MAX_STORED_EVIDENCE_BYTES = 16 * 1024;

const pendingRunIds = [];
const pendingRunSet = new Set();

let activeRunCount = 0;
let reservedQueueSlots = 0;
let drainScheduled = false;

const createQueueFullError = () =>
  new AppError(
    "The regression-run queue is full. Wait for an existing run to finish before starting another.",
    {
      statusCode: 429,
      code: "TEST_RUN_QUEUE_FULL",
    }
  );

export const reserveTestRunQueueSlot = () => {
  if (pendingRunIds.length + reservedQueueSlots >= MAX_WAITING_RUNS) {
    throw createQueueFullError();
  }

  reservedQueueSlots += 1;

  let released = false;

  return () => {
    if (released) return;

    released = true;
    reservedQueueSlots = Math.max(0, reservedQueueSlots - 1);
  };
};

const summarizeTestResults = (results, total) => {
  const summary = {
    total,
    passed: 0,
    failed: 0,
    skipped: 0,
    unsupported: 0,
    errors: 0,
  };

  for (const result of results) {
    if (!result) continue;

    if (result.status === "PASSED") {
      summary.passed += 1;
    } else if (result.status === "FAILED") {
      summary.failed += 1;
    } else if (result.status === "SKIPPED") {
      summary.skipped += 1;
    } else if (result.status === "UNSUPPORTED") {
      summary.unsupported += 1;
    } else if (result.status === "ERROR") {
      summary.errors += 1;
    }
  }

  return summary;
};

const toPersistedSummary = (summary) => ({
  total: summary.total,
  passed: summary.passed,
  failed: summary.failed,
  skipped: summary.skipped,
  unsupported: summary.unsupported,
  errorCount: summary.errors ?? summary.errorCount ?? 0,
});

const toPersistedSchemaValidation = (validation) => {
  const source = validation ?? {};

  const {
    errors,
    validationErrors,
    ...remaining
  } = source;

  return {
    ...remaining,
    validationErrors: validationErrors ?? errors ?? [],
  };
};

const toPersistedResult = (result) => ({
  ...result,
  candidateSchemaValidation: toPersistedSchemaValidation(
    result.candidateSchemaValidation
  ),
  baselineSchemaValidation: toPersistedSchemaValidation(
    result.baselineSchemaValidation
  ),
});

const getFinalRunStatus = (summary) => {
  if (summary.failed > 0 || summary.errors > 0) {
    return "FAILED";
  }

  const completedCount =
    summary.passed +
    summary.failed +
    summary.skipped +
    summary.unsupported +
    summary.errors;

  if (
    completedCount !== summary.total ||
    summary.skipped > 0 ||
    summary.unsupported > 0
  ) {
    return "PARTIAL";
  }

  return "PASSED";
};

const toBoundedResponseEvidence = (body) => {
  let serialized;

  try {
    serialized = JSON.stringify(body);
  } catch {
    throw new AppError(
      "The candidate response could not be serialized safely.",
      {
        statusCode: 422,
        code: "TEST_RUN_RESPONSE_INVALID",
      }
    );
  }

  if (
    Buffer.byteLength(serialized ?? "null", "utf8") >
    MAX_RESPONSE_BODY_BYTES
  ) {
    throw new AppError(
      "The candidate response exceeded the maximum response-body size.",
      {
        statusCode: 413,
        code: "TEST_RUN_RESPONSE_TOO_LARGE",
      }
    );
  }

  const preview = serialized ?? "null";
  const previewBuffer = Buffer.from(preview, "utf8");
  const truncated =
    previewBuffer.length > MAX_STORED_EVIDENCE_BYTES;

  let boundedPreview = preview;

  if (truncated) {
    const decoder = new TextDecoder("utf-8", {
      fatal: true,
    });

    let end = MAX_STORED_EVIDENCE_BYTES;

    while (end > 0) {
      try {
        boundedPreview = decoder.decode(
          previewBuffer.subarray(0, end)
        );

        break;
      } catch {
        end -= 1;
      }
    }
  }

  return {
    responseBody: truncated ? null : body,
    responsePreview: boundedPreview,
    responseBodyTruncated: truncated,
  };
};

const createResultBase = (snapshot, startedAt) => ({
  testCaseId: snapshot.testCaseId,
  title: snapshot.title,
  operationKey: snapshot.operationKey,
  operationPath: snapshot.operationPath,
  startedAt,
});

const createFailedResult = (
  snapshot,
  error,
  startedAt,
  completedAt,
  status = "ERROR"
) => ({
  ...createResultBase(snapshot, startedAt),
  status,
  durationMs: Math.max(
    0,
    completedAt.getTime() - startedAt.getTime()
  ),
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
  errorCode: String(
    error?.code ?? "TEST_RUN_EXECUTION_ERROR"
  ).slice(0, 100),
  errorMessage: String(
    error?.message ?? "The test could not be executed."
  ).slice(0, 1000),
  completedAt,
});

const createSkippedResult = (snapshot, message) => {
  const now = new Date();

  return {
    ...createResultBase(snapshot, now),
    status: "SKIPPED",
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
    errorCode: "TEST_RUN_DEADLINE_REACHED",
    errorMessage: message,
    completedAt: now,
  };
};

const getOperationDetails = async ({
  ownerId,
  specVersionId,
  operationKey,
  expectedPath,
}) => {
  const detail =
    await specificationExplorerService.getSpecificationOperation(
      ownerId.toString(),
      specVersionId.toString(),
      operationKey
    );

  const operation = detail.operation;

  if (
    operation.kind !== "path" ||
    operation.method !== "GET" ||
    operation.path !== expectedPath
  ) {
    throw new AppError(
      "The approved test case no longer maps to a supported GET operation in both trusted fixtures.",
      {
        statusCode: 422,
        code: "TEST_RUN_OPERATION_UNSUPPORTED",
      }
    );
  }

  return operation;
};

const executeOneTestCase = async ({
  run,
  snapshot,
  baselineDocument,
  candidateDocument,
  startedAt = new Date(),
}) => {
  const base = createResultBase(snapshot, startedAt);

  const [baselineOperation, candidateOperation] =
    await Promise.all([
      getOperationDetails({
        ownerId: run.ownerId,
        specVersionId: run.baselineVersionId,
        operationKey: snapshot.operationKey,
        expectedPath: snapshot.operationPath,
      }),
      getOperationDetails({
        ownerId: run.ownerId,
        specVersionId: run.candidateVersionId,
        operationKey: snapshot.operationKey,
        expectedPath: snapshot.operationPath,
      }),
    ]);

  const request = buildTestRunRequest({
    testCase: snapshot,
    baselineOperation,
    candidateOperation,
  });

  const response = await executeDemoStoreAdapter(request);
  const evidence = toBoundedResponseEvidence(response.body);

  const validation = validateRegressionResponse({
    baselineOperation,
    candidateOperation,
    baselineDocument,
    candidateDocument,
    response,
    assertions: snapshot.assertions ?? {},
  });

  const completedAt = new Date();

  return {
    ...base,
    status: validation.status,
    expectedStatus:
      snapshot.assertions?.expectedStatus ?? null,
    actualStatus: response.statusCode,
    contentType: response.contentType,
    durationMs: Math.max(
      0,
      completedAt.getTime() - startedAt.getTime()
    ),
    candidateSchemaValidation:
      validation.candidateSchemaValidation,
    baselineSchemaValidation:
      validation.baselineSchemaValidation,
    assertions: validation.assertions,
    ...evidence,
    errorCode: null,
    errorMessage: null,
    completedAt,
  };
};

const executeWithTimeout = async (
  parameters,
  timeoutMs = PER_TEST_TIMEOUT_MS
) => {
  let timeoutId;

  const startedAt = new Date();

  const boundedTimeoutMs = Math.max(
    1,
    Math.min(PER_TEST_TIMEOUT_MS, timeoutMs)
  );

  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ timedOut: true }),
      boundedTimeoutMs
    );
  });

  try {
    const execution = executeOneTestCase({
      ...parameters,
      startedAt,
    })
      .then((result) => ({ result }))
      .catch((error) => ({ error }));

    const outcome = await Promise.race([
      execution,
      timeout,
    ]);

    if (outcome.timedOut) {
      const completedAt = new Date();

      return createFailedResult(
        parameters.snapshot,
        {
          code: "TEST_RUN_TEST_TIMEOUT",
          message: `The test exceeded its ${boundedTimeoutMs} ms execution allowance.`,
        },
        startedAt,
        completedAt
      );
    }

    if (outcome.error) {
      const now = new Date();

      const status = [
        "TEST_RUN_INPUT_UNSUPPORTED",
        "TEST_RUN_OPERATION_UNSUPPORTED",
      ].includes(outcome.error?.code)
        ? "UNSUPPORTED"
        : outcome.error?.code ===
            "TEST_RUN_CANDIDATE_REQUEST_INCOMPATIBLE"
          ? "FAILED"
          : "ERROR";

      return createFailedResult(
        parameters.snapshot,
        outcome.error,
        startedAt,
        now,
        status
      );
    }

    return outcome.result;
  } finally {
    clearTimeout(timeoutId);
  }
};

const persistProgress = async (
  runId,
  results,
  total
) => {
  const completedResults = results.filter(Boolean);

  await TestRun.updateOne(
    {
      _id: runId,
      status: "RUNNING",
    },
    {
      $set: {
        results: completedResults.map(toPersistedResult),
        summary: toPersistedSummary(
          summarizeTestResults(completedResults, total)
        ),
      },
    },
    { runValidators: true }
  ).exec();
};

const executeQueuedRun = async (runId) => {
  const run = await TestRun.findOneAndUpdate(
    {
      _id: runId,
      status: "QUEUED",
    },
    {
      $set: {
        status: "RUNNING",
        startedAt: new Date(),
        failureReason: null,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  )
    .lean()
    .exec();

  if (!run) return;

  try {
    const [baseline, candidate] = await Promise.all([
      SpecVersion.findOne({
        _id: run.baselineVersionId,
        projectId: run.projectId,
      })
        .lean()
        .exec(),
      SpecVersion.findOne({
        _id: run.candidateVersionId,
        projectId: run.projectId,
      })
        .lean()
        .exec(),
    ]);

    const fixturePair = verifyTrustedFixturePair({
      baseline,
      candidate,
      direction: run.direction,
    });

    if (
      !fixturePair.eligible ||
      baseline.contentHash !== run.baselineContentHash ||
      candidate.contentHash !== run.candidateContentHash
    ) {
      throw new AppError(
        "The trusted specification pair changed or is no longer eligible for execution.",
        {
          statusCode: 409,
          code: "TEST_RUN_FIXTURE_REVALIDATION_FAILED",
        }
      );
    }

    const baselineDocument = baseline.document;
    const candidateDocument = candidate.document;
    const snapshots = run.testCaseSnapshots ?? [];

    const results = new Array(snapshots.length).fill(null);

    const runStartedAt = run.startedAt
      ? new Date(run.startedAt).getTime()
      : Date.now();

    let nextIndex = 0;
    let persistChain = Promise.resolve();

    const saveProgress = () => {
      persistChain = persistChain.then(() =>
        persistProgress(
          run._id,
          results,
          snapshots.length
        )
      );

      return persistChain;
    };

    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= snapshots.length) return;

        const snapshot = snapshots[index];

        if (
          Date.now() - runStartedAt >=
          TOTAL_RUN_DEADLINE_MS
        ) {
          results[index] = createSkippedResult(
            snapshot,
            `The run reached its ${TOTAL_RUN_DEADLINE_MS} ms total execution deadline.`
          );

          await saveProgress();
          continue;
        }

        const remainingRunTime =
          TOTAL_RUN_DEADLINE_MS -
          (Date.now() - runStartedAt);

        if (remainingRunTime <= 0) {
          results[index] = createSkippedResult(
            snapshot,
            `The run reached its ${TOTAL_RUN_DEADLINE_MS} ms total execution deadline.`
          );
        } else {
          results[index] = await executeWithTimeout(
            {
              run,
              snapshot,
              baselineDocument,
              candidateDocument,
            },
            remainingRunTime
          );
        }

        await saveProgress();
      }
    };

    const workerCount = Math.min(
      MAX_CONCURRENT_TESTS_PER_RUN,
      snapshots.length
    );

    const workerOutcomes = await Promise.allSettled(
      Array.from(
        { length: workerCount },
        () => worker()
      )
    );

    const rejectedWorker = workerOutcomes.find(
      (outcome) => outcome.status === "rejected"
    );

    if (rejectedWorker) {
      throw rejectedWorker.reason;
    }

    await persistChain;

    const finalResults = results.filter(Boolean);

    const summary = summarizeTestResults(
      finalResults,
      snapshots.length
    );

    const status = getFinalRunStatus(summary);

    await TestRun.updateOne(
      {
        _id: run._id,
        status: "RUNNING",
      },
      {
        $set: {
          status,
          summary: toPersistedSummary(summary),
          results: finalResults.map(toPersistedResult),
          completedAt: new Date(),
          failureReason: null,
        },
      },
      { runValidators: true }
    ).exec();
  } catch {
    const current = await TestRun.findById(run._id)
      .lean()
      .exec();

    if (!current || current.status !== "RUNNING") return;

    const existingResults = Array.isArray(current.results)
      ? current.results
      : [];

    const completedIds = new Set(
      existingResults.map(
        (entry) => String(entry.testCaseId)
      )
    );

    const now = new Date();

    const fallbackResults = [
      ...existingResults,
      ...(current.testCaseSnapshots ?? [])
        .filter(
          (snapshot) =>
            !completedIds.has(String(snapshot.testCaseId))
        )
        .map((snapshot) =>
          createFailedResult(
            snapshot,
            {
              code: "TEST_RUN_INTERNAL_EXECUTION_ERROR",
              message:
                "The test could not be completed because an internal execution error occurred.",
            },
            now,
            now,
            "ERROR"
          )
        ),
    ];

    const summary = summarizeTestResults(
      fallbackResults,
      current.testCaseSnapshots?.length ??
        fallbackResults.length
    );

    await TestRun.updateOne(
      {
        _id: run._id,
        status: "RUNNING",
      },
      {
        $set: {
          status: "FAILED",
          results: fallbackResults.map(toPersistedResult),
          summary: toPersistedSummary(summary),
          completedAt: now,
          failureReason:
            "The regression run stopped because an internal execution error occurred. Review the individual results or retry the run.",
        },
      },
      { runValidators: true }
    ).exec();
  }
};

const scheduleDrain = () => {
  if (drainScheduled) return;

  drainScheduled = true;

  setImmediate(() => {
    drainScheduled = false;
    drainQueue();
  });
};

const drainQueue = () => {
  while (
    activeRunCount < MAX_CONCURRENT_RUNS &&
    pendingRunIds.length > 0
  ) {
    const runId = pendingRunIds.shift();

    pendingRunSet.delete(runId);
    activeRunCount += 1;

    executeQueuedRun(runId)
      .catch((error) => {
        process.stderr.write(
          `ContractGuard test-run worker failed: ${String(
            error?.message ?? error
          )}\n`
        );
      })
      .finally(() => {
        activeRunCount = Math.max(
          0,
          activeRunCount - 1
        );

        scheduleDrain();
      });
  }
};

export const enqueueTestRun = (runId) => {
  const normalizedId = String(runId);

  if (pendingRunSet.has(normalizedId)) return;

  if (pendingRunIds.length >= MAX_WAITING_RUNS) {
    throw createQueueFullError();
  }

  pendingRunIds.push(normalizedId);
  pendingRunSet.add(normalizedId);

  scheduleDrain();
};

export const recoverInterruptedTestRuns = async () => {
  const now = new Date();

  const result = await TestRun.updateMany(
    {
      status: {
        $in: ["QUEUED", "RUNNING"],
      },
    },
    {
      $set: {
        status: "INTERRUPTED",
        completedAt: now,
        failureReason:
          "The server restarted before this run completed. Start a new run to retry.",
      },
    },
    { runValidators: true }
  ).exec();

  return result.modifiedCount ?? 0;
};

export const testRunExecutionLimits = Object.freeze({
  maxWaitingRuns: MAX_WAITING_RUNS,
  maxConcurrentRuns: MAX_CONCURRENT_RUNS,
  maxConcurrentTestsPerRun: MAX_CONCURRENT_TESTS_PER_RUN,
  perTestTimeoutMs: PER_TEST_TIMEOUT_MS,
  totalRunDeadlineMs: TOTAL_RUN_DEADLINE_MS,
  maxResponseBodyBytes: MAX_RESPONSE_BODY_BYTES,
  maxStoredEvidenceBytes: MAX_STORED_EVIDENCE_BYTES,
});

export const testRunExecutionInternals = Object.freeze({
  summarizeTestResults,
  getFinalRunStatus,
  toBoundedResponseEvidence,
  createSkippedResult,
});

export default {
  reserveTestRunQueueSlot,
  enqueueTestRun,
  recoverInterruptedTestRuns,
};