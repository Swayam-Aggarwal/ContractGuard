
import mongoose from "mongoose";
import { createHash } from "node:crypto";

import Project from "../models/project.model.js";
import SpecVersion from "../models/specVersion.model.js";
import DiffReport from "../models/diffReport.model.js";

import createCompatibilityAnalysis from
  "./compatibility-analysis.service.js";

import AppError from "../utils/appError.js";

const ANALYZER_VERSION = "2.0.1";
const DEFAULT_REPORT_LIMIT = 20;
const MAX_REPORT_LIMIT = 50;

// Keep a comfortable margin below MongoDB's 16 MiB BSON document limit.
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
}) => {
  return createHash("sha256")
    .update(
      [
        projectId.toString(),
        baselineContentHash,
        candidateContentHash,
        ANALYZER_VERSION,
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

const toPublicReport = (report) => {
  const value = typeof report.toObject === "function"
    ? report.toObject()
    : report;

  return {
    id: value._id.toString(),
    projectId: value.projectId.toString(),
    baselineSpecVersionId:
      value.baselineSpecVersionId.toString(),
    candidateSpecVersionId:
      value.candidateSpecVersionId.toString(),

    baselineLabel: value.baselineLabel,
    candidateLabel: value.candidateLabel,

    baselineContentHash: value.baselineContentHash,
    candidateContentHash: value.candidateContentHash,

    analyzerVersion: value.analyzerVersion,
    analysisStatus: value.analysisStatus,

    summary: value.summary,
    changes: value.changes,
    warnings: value.warnings,

    createdAt: value.createdAt,
  };
};

const toPublicReportSummary = (report) => {
  return {
    id: report._id.toString(),
    baselineSpecVersionId:
      report.baselineSpecVersionId.toString(),
    candidateSpecVersionId:
      report.candidateSpecVersionId.toString(),

    baselineLabel: report.baselineLabel,
    candidateLabel: report.candidateLabel,

    analysisStatus: report.analysisStatus,
    summary: report.summary,

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

  // Normalize ObjectIds before equality checks and database queries.
  // This also handles valid hexadecimal IDs supplied in uppercase.
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
  });

  const existing = await DiffReport.findOne({
    projectId: normalizedProjectId,
    analysisFingerprint,
  }).exec();

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

      baselineSpecVersionId: baseline._id,
      candidateSpecVersionId: candidate._id,

      baselineContentHash: baseline.contentHash,
      candidateContentHash: candidate.contentHash,

      baselineLabel: baseline.label,
      candidateLabel: candidate.label,

      analyzerVersion: ANALYZER_VERSION,
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
    // Handle simultaneous requests for the same version pair.
    if (error?.code === 11000) {
      const existingReport = await DiffReport.findOne({
        projectId: normalizedProjectId,
        analysisFingerprint,
      }).exec();

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
      "baselineSpecVersionId candidateSpecVersionId baselineLabel candidateLabel analysisStatus summary createdAt"
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
