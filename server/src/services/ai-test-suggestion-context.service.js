import diffReportService from "./diffReport.service.js";
import specVersionService from "./specVersion.service.js";
import specificationExplorerService from
  "./specification-explorer.service.js";

import {
  FIXTURE_REGISTRY,
  verifyTrustedFixturePair,
} from "./fixture-registry.service.js";

import AppError from "../utils/appError.js";

export const AI_TEST_SUGGESTION_CONTEXT_VERSION =
  "DEMO_STORE_AI_CONTEXT_V2";

export const AI_TEST_SUGGESTION_OPERATIONS = Object.freeze({
  listProducts: Object.freeze({
    operationId: "listProducts",
    method: "GET",
    path: "/products",
    pathParameters: Object.freeze([]),
    queryParameters: Object.freeze(["limit"]),
  }),

  getProduct: Object.freeze({
    operationId: "getProduct",
    method: "GET",
    path: "/products/{productId}",
    pathParameters: Object.freeze(["productId"]),
    queryParameters: Object.freeze([]),
  }),
});

const createIneligibleError = (
  message =
    "AI test suggestions are only available for a complete, trusted Demo Store V1-to-V2 comparison."
) =>
  new AppError(message, {
    statusCode: 422,
    code: "AI_SUGGESTIONS_UNSUPPORTED_COMPARISON",
  });

const createUnsupportedOperationError = () =>
  new AppError(
    "The selected operation is not supported for AI test suggestions.",
    {
      statusCode: 422,
      code: "AI_OPERATION_UNSUPPORTED",
    }
  );

const normalizeId = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
};

const sanitizeText = (value, maximumLength = 180) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[\u0000-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximumLength);
};

const CLASSIFICATION_PRIORITY = Object.freeze({
  BREAKING: 0,
  POTENTIALLY_BREAKING: 1,
  INFORMATIONAL: 2,
  NON_BREAKING: 3,
  UNSUPPORTED: 4,
});

const sanitizeFindings = (changes = []) =>
  [...changes]
    .sort((left, right) => {
      const leftPriority =
        CLASSIFICATION_PRIORITY[left?.classification] ?? 5;

      const rightPriority =
        CLASSIFICATION_PRIORITY[right?.classification] ?? 5;

      return leftPriority - rightPriority;
    })
    .slice(0, 4)
    .map((change) => {
      const allowedClassification = Object.hasOwn(
        CLASSIFICATION_PRIORITY,
        change?.classification
      )
        ? change.classification
        : "INFORMATIONAL";

      const allowedPath = Object.values(
        AI_TEST_SUGGESTION_OPERATIONS
      ).some(
        (operation) => operation.path === change?.path
      )
        ? change.path
        : null;

      return {
        category: sanitizeText(change?.category, 40),
        classification: allowedClassification,
        method: change?.method === "GET" ? "GET" : null,
        path: allowedPath,
        field: sanitizeText(change?.field, 80),
        summary: sanitizeText(change?.summary, 180),
      };
    });

/*
 * Resolve every supported operation against the trusted baseline.
 *
 * This produces an internal, verified index. The complete index is
 * never returned as operationsByOperationId for a selected request.
 */
const findTrustedOperations = (
  operationSummaries,
  baselineVersionId
) => {
  const trustedOperations = {};

  for (const [operationId, definition] of Object.entries(
    AI_TEST_SUGGESTION_OPERATIONS
  )) {
    const matches = operationSummaries.filter(
      (operation) =>
        operation?.kind === "path" &&
        operation?.method === definition.method &&
        operation?.path === definition.path &&
        operation?.operationId === operationId
    );

    if (matches.length !== 1) {
      throw createIneligibleError(
        "The trusted baseline does not contain exactly one matching entry for each supported Demo Store operation."
      );
    }

    const operation = matches[0];

    if (
      typeof operation.operationKey !== "string" ||
      !/^op_[A-Za-z0-9_-]{43}$/u.test(
        operation.operationKey
      )
    ) {
      throw createIneligibleError(
        "A canonical baseline operation could not be resolved."
      );
    }

    trustedOperations[operationId] = {
      operationKey: operation.operationKey,
      method: definition.method,
      path: definition.path,
      specVersionId: baselineVersionId,
    };
  }

  return trustedOperations;
};

const createPublicAvailableOperations = (
  trustedOperations
) =>
  Object.entries(AI_TEST_SUGGESTION_OPERATIONS)
    .filter(([operationId]) =>
      Object.hasOwn(trustedOperations, operationId)
    )
    .map(([operationId, definition]) => ({
      operationId,
      method: definition.method,
      path: definition.path,
    }));

const createModelOperation = (
  operationId,
  definition
) => ({
  operationId,
  method: definition.method,
  path: definition.path,
  pathParameters: [...definition.pathParameters],
  queryParameters: [...definition.queryParameters],
});

const createModelContext = ({
  operationIds,
  changes,
}) => {
  const selectedOperationIds = new Set(operationIds);

  const operations = Object.entries(
    AI_TEST_SUGGESTION_OPERATIONS
  )
    .filter(([operationId]) =>
      selectedOperationIds.has(operationId)
    )
    .map(([operationId, definition]) =>
      createModelOperation(operationId, definition)
    );

  const allowedPaths = new Set(
    operations.map((operation) => operation.path)
  );

  const compatibilityFindings = sanitizeFindings(changes)
    .filter(
      (finding) =>
        finding.path !== null &&
        allowedPaths.has(finding.path)
    );

  return {
    contextVersion: AI_TEST_SUGGESTION_CONTEXT_VERSION,

    comparison: {
      baseline: {
        fixtureId: FIXTURE_REGISTRY.baseline.fixtureId,
        apiVersion: FIXTURE_REGISTRY.baseline.apiVersion,
      },

      candidate: {
        fixtureId: FIXTURE_REGISTRY.candidate.fixtureId,
        apiVersion: FIXTURE_REGISTRY.candidate.apiVersion,
      },

      direction: FIXTURE_REGISTRY.direction,
    },

    operations,

    compatibilityFindings,
  };
};

export const createAiTestSuggestionContextService = ({
  reportService = diffReportService,
  specificationService = specVersionService,
  explorerService = specificationExplorerService,
  fixtureVerifier = verifyTrustedFixturePair,
} = {}) => {
  const buildAiTestSuggestionContext = async ({
    ownerId,
    projectId,
    reportId,
    operationId,
  }) => {
    /*
     * Reject unsupported selections before making database calls.
     *
     * An omitted operationId remains supported for context-only
     * callers that need the complete verified operation catalogue.
     */
    const hasSelectedOperation =
      operationId !== undefined &&
      operationId !== null;

    if (
      hasSelectedOperation &&
      !Object.hasOwn(
        AI_TEST_SUGGESTION_OPERATIONS,
        operationId
      )
    ) {
      throw createUnsupportedOperationError();
    }

    const report = await reportService.getDiffReport(
      ownerId,
      projectId,
      reportId
    );

    if (
      !report ||
      normalizeId(report.projectId) !== normalizeId(projectId)
    ) {
      throw createIneligibleError();
    }

    if (report.analysisStatus !== "COMPLETE") {
      throw createIneligibleError(
        "AI suggestions require a complete comparison report."
      );
    }

    const baselineVersionId = normalizeId(
      report.baselineVersionId ??
        report.baselineSpecVersionId
    );

    const candidateVersionId = normalizeId(
      report.candidateVersionId ??
        report.candidateSpecVersionId
    );

    if (!baselineVersionId || !candidateVersionId) {
      throw createIneligibleError();
    }

    const [baseline, candidate] = await Promise.all([
      specificationService.getSpecificationVersionRecord(
        ownerId,
        baselineVersionId
      ),

      specificationService.getSpecificationVersionRecord(
        ownerId,
        candidateVersionId
      ),
    ]);

    if (
      !baseline ||
      !candidate ||
      normalizeId(baseline.projectId) !== normalizeId(projectId) ||
      normalizeId(candidate.projectId) !== normalizeId(projectId)
    ) {
      throw createIneligibleError();
    }

    if (
      report.baselineContentHash !== baseline.contentHash ||
      report.candidateContentHash !== candidate.contentHash
    ) {
      throw createIneligibleError(
        "The stored comparison hashes do not match the specification versions."
      );
    }

    const fixtureEligibility = fixtureVerifier({
      baseline,
      candidate,
      direction: report.direction,
    });

    if (!fixtureEligibility?.eligible) {
      throw createIneligibleError();
    }

    if (
      fixtureEligibility.baseline?.fixtureId !==
        FIXTURE_REGISTRY.baseline.fixtureId ||
      fixtureEligibility.candidate?.fixtureId !==
        FIXTURE_REGISTRY.candidate.fixtureId
    ) {
      throw createIneligibleError();
    }

    const operationResult =
      await explorerService.listSpecificationOperations(
        ownerId,
        baselineVersionId
      );

    const operationSummaries = Array.isArray(
      operationResult?.operations
    )
      ? operationResult.operations
      : [];

    /*
     * Verify every supported operation against the trusted baseline.
     * The full verified index remains internal until selection.
     */
    const allTrustedOperations = findTrustedOperations(
      operationSummaries,
      baselineVersionId
    );

    const availableOperations =
      createPublicAvailableOperations(
        allTrustedOperations
      );

    const selectedOperationIds = hasSelectedOperation
      ? [operationId]
      : Object.keys(allTrustedOperations);

    const operationsByOperationId = Object.fromEntries(
      selectedOperationIds.map((selectedId) => [
        selectedId,
        allTrustedOperations[selectedId],
      ])
    );

    const modelContext = createModelContext({
      operationIds: selectedOperationIds,
      changes: Array.isArray(report.changes)
        ? report.changes
        : [],
    });

    return {
      contextVersion: AI_TEST_SUGGESTION_CONTEXT_VERSION,

      baselineVersionId,

      selectedOperationId: hasSelectedOperation
        ? operationId
        : null,

      operationsByOperationId,

      availableOperations,

      modelContext,
    };
  };

  return {
    buildAiTestSuggestionContext,
  };
};

const defaultContextService =
  createAiTestSuggestionContextService();

export const buildAiTestSuggestionContext = (input) =>
  defaultContextService.buildAiTestSuggestionContext(input);