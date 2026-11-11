import mongoose from "mongoose";
import { createHash } from "node:crypto";

import Project from "../models/project.model.js";
import SpecVersion from "../models/specVersion.model.js";
import DiffReport from "../models/diffReport.model.js";

import createCompatibilityAnalysis from
  "./compatibility-analysis.service.js";

import AppError from "../utils/appError.js";

import {
  COMPATIBILITY_DIRECTION,
  COMPATIBILITY_RULESET_VERSION,
  createClassificationSummary,
  createFindingContract,
} from "./compatibility-report-contract.js";

const ANALYZER_VERSION = "2.0.4";
const DEFAULT_REPORT_LIMIT = 20;
const MAX_REPORT_LIMIT = 50;

const MAX_REPORT_SIZE_BYTES = 8 * 1024 * 1024;

const isValidObjectId = (value) => {
  return mongoose.isObjectIdOrHexString(value);
};

const normalizeObjectId = (value) => {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(value);
};

const createNotFoundError = () =>
  new AppError("Resource not found.", {
    statusCode: 404,
    code: "RESOURCE_NOT_FOUND",
  });

const createValidationError = (message, field) =>
  new AppError(message, {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    details: [
      {
        field,
        message,
      },
    ],
  });

const createDuplicateReportError = () =>
  new AppError(
    "Unable to retrieve the existing comparison report.",
    {
      statusCode: 409,
      code: "DUPLICATE_RESOURCE",
    }
  );

const createReportSizeError = () =>
  new AppError(
    "The comparison report is too large to store safely. Reduce the specification complexity or split the comparison.",
    {
      statusCode: 413,
      code: "DIFF_REPORT_TOO_LARGE",
      details: [
        {
          field: "changes",
          message: `The report must not exceed ${MAX_REPORT_SIZE_BYTES} bytes.`,
        },
      ],
    }
  );

const createFingerprint = ({
  projectId,
  baselineContentHash,
  candidateContentHash,
  rulesetVersion,
}) => {
  return createHash("sha256")
    .update(
      [
        projectId.toString(),
        baselineContentHash,
        candidateContentHash,
        ANALYZER_VERSION,
        rulesetVersion,
      ].join("\u0000"),
      "utf8"
    )
    .digest("hex");
};

const getReportPayloadSize = (analysis) => {
  try {
    return Buffer.byteLength(
      JSON.stringify({
        summary: analysis.summary,
        changes: analysis.changes,
        warnings: analysis.warnings,
      }),
      "utf8"
    );
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

const toPublicSummary = (summary = {}, changes = []) => {
  const counts = createClassificationSummary(changes);

  return {
    ...summary,

    breaking:
      summary.breaking ??
      summary.breakingChanges ??
      counts.breaking,

    potentiallyBreaking:
      summary.potentiallyBreaking ??
      counts.potentiallyBreaking,

    nonBreaking:
      summary.nonBreaking ??
      summary.nonBreakingChanges ??
      counts.nonBreaking,

    informational:
      summary.informational ??
      summary.informationalChanges ??
      counts.informational,

    unsupported:
      summary.unsupported ??
      counts.unsupported,
  };
};

const toPublicChanges = (changes = []) => {
  return changes.map((change) => createFindingContract(change));
};

const toPublicReport = (report) => {
  const value = typeof report.toObject === "function"
    ? report.toObject()
    : report;

  const changes = toPublicChanges(value.changes ?? []);

  return {
    id: value._id.toString(),
    projectId: value.projectId.toString(),

    baselineVersionId: (
      value.baselineVersionId ?? value.baselineSpecVersionId
    ).toString(),

    candidateVersionId: (
      value.candidateVersionId ?? value.candidateSpecVersionId
    ).toString(),

    baselineSpecVersionId: (
      value.baselineSpecVersionId ?? value.baselineVersionId
    ).toString(),

    candidateSpecVersionId: (
      value.candidateSpecVersionId ?? value.candidateVersionId
    ).toString(),

    baselineLabel: value.baselineLabel,
    candidateLabel: value.candidateLabel,

    baselineContentHash: value.baselineContentHash,
    candidateContentHash: value.candidateContentHash,

    analyzerVersion: value.analyzerVersion,
    direction: value.direction ?? null,
    rulesetVersion: value.rulesetVersion ?? null,
    analysisStatus: value.analysisStatus,

    summary: toPublicSummary(value.summary, changes),
    changes,
    warnings: value.warnings,

    createdAt: value.createdAt,
  };
};

const toPublicReportSummary = (report) => {
  return {
    id: report._id.toString(),

    baselineVersionId: (
      report.baselineVersionId ?? report.baselineSpecVersionId
    ).toString(),

    candidateVersionId: (
      report.candidateVersionId ?? report.candidateSpecVersionId
    ).toString(),

    baselineSpecVersionId: (
      report.baselineSpecVersionId ?? report.baselineVersionId
    ).toString(),

    candidateSpecVersionId: (
      report.candidateSpecVersionId ?? report.candidateVersionId
    ).toString(),

    baselineLabel: report.baselineLabel,
    candidateLabel: report.candidateLabel,

    direction: report.direction ?? null,
    rulesetVersion: report.rulesetVersion ?? null,
    analysisStatus: report.analysisStatus,
    summary: toPublicSummary(report.summary),

    createdAt: report.createdAt,
  };
};

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
    _id: normalizeObjectId(projectId),
    ownerId: normalizeObjectId(ownerId),
  });

  if (!project) {
    throw createNotFoundError();
  }
};

const createDiffReport = async (
  ownerId,
  projectId,
  {
    baselineSpecVersionId,
    candidateSpecVersionId,
  }
) => {
  await verifyProjectOwnership(ownerId, projectId);

  if (
    !isValidObjectId(baselineSpecVersionId) ||
    !isValidObjectId(candidateSpecVersionId)
  ) {
    throw createValidationError(
      "Both specification version IDs must be valid.",
      "specificationVersions"
    );
  }

  const normalizedProjectId = normalizeObjectId(projectId);
  const normalizedOwnerId = normalizeObjectId(ownerId);
  const baselineId = normalizeObjectId(baselineSpecVersionId);
  const candidateId = normalizeObjectId(candidateSpecVersionId);

  if (baselineId.equals(candidateId)) {
    throw createValidationError(
      "Baseline and candidate must be different specification versions.",
      "candidateSpecVersionId"
    );
  }

  const versions = await SpecVersion.find({
    _id: {
      $in: [baselineId, candidateId],
    },
    projectId: normalizedProjectId,
  })
    .lean()
    .exec();

  if (versions.length !== 2) {
    throw createNotFoundError();
  }

  const baseline = versions.find(
    (version) => version._id.equals(baselineId)
  );

  const candidate = versions.find(
    (version) => version._id.equals(candidateId)
  );

  if (!baseline || !candidate) {
    throw createNotFoundError();
  }

  const analysisFingerprint = createFingerprint({
    projectId: normalizedProjectId,
    baselineContentHash: baseline.contentHash,
    candidateContentHash: candidate.contentHash,
    rulesetVersion: COMPATIBILITY_RULESET_VERSION,
  });

  const existing = await DiffReport.findOne({
    projectId: normalizedProjectId,
    analysisFingerprint,
  })
    .lean()
    .exec();

  if (existing) {
    return {
      report: toPublicReport(existing),
      reused: true,
    };
  }

  const analysis = createCompatibilityAnalysis(
    baseline.document,
    candidate.document,
    {
      baselineWarnings: baseline.warnings ?? [],
      candidateWarnings: candidate.warnings ?? [],
      baselineExplorerWarnings: baseline.explorerWarnings ?? [],
      candidateExplorerWarnings: candidate.explorerWarnings ?? [],
    }
  );

  if (getReportPayloadSize(analysis) > MAX_REPORT_SIZE_BYTES) {
    throw createReportSizeError();
  }

  try {
    const created = await DiffReport.create({
      projectId: normalizedProjectId,
      createdBy: normalizedOwnerId,

      baselineVersionId: baseline._id,
      candidateVersionId: candidate._id,

      baselineContentHash: baseline.contentHash,
      candidateContentHash: candidate.contentHash,

      baselineLabel: baseline.label,
      candidateLabel: candidate.label,

      analyzerVersion: ANALYZER_VERSION,
      direction: COMPATIBILITY_DIRECTION,
      rulesetVersion: COMPATIBILITY_RULESET_VERSION,
      analysisFingerprint,

      analysisStatus: analysis.analysisStatus,
      summary: analysis.summary,
      changes: analysis.changes,
      warnings: analysis.warnings,
    });

    return {
      report: toPublicReport(created),
      reused: false,
    };
  } catch (error) {
    if (error?.code === 11000) {
      const existingReport = await DiffReport.findOne({
        projectId: normalizedProjectId,
        analysisFingerprint,
      })
        .lean()
        .exec();

      if (existingReport) {
        return {
          report: toPublicReport(existingReport),
          reused: true,
        };
      }

      throw createDuplicateReportError();
    }

    throw error;
  }
};

const listDiffReports = async (
  ownerId,
  projectId,
  limit = DEFAULT_REPORT_LIMIT
) => {
  await verifyProjectOwnership(ownerId, projectId);

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_REPORT_LIMIT
  ) {
    throw createValidationError(
      `Report limit must be between 1 and ${MAX_REPORT_LIMIT}.`,
      "limit"
    );
  }

  const reports = await DiffReport.find({
    projectId: normalizeObjectId(projectId),
  })
    .select(
      "baselineVersionId candidateVersionId baselineSpecVersionId candidateSpecVersionId baselineLabel candidateLabel direction rulesetVersion analysisStatus summary createdAt"
    )
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(limit)
    .lean()
    .exec();

  return reports.map(toPublicReportSummary);
};

const getDiffReport = async (
  ownerId,
  projectId,
  reportId
) => {
  await verifyProjectOwnership(ownerId, projectId);

  if (!isValidObjectId(reportId)) {
    throw createNotFoundError();
  }

  const report = await DiffReport.findOne({
    _id: normalizeObjectId(reportId),
    projectId: normalizeObjectId(projectId),
  })
    .lean()
    .exec();

  if (!report) {
    throw createNotFoundError();
  }

  return toPublicReport(report);
};

const diffReportService = {
  createDiffReport,
  listDiffReports,
  getDiffReport,
};

export default diffReportService;