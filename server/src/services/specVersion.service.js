import mongoose from "mongoose";
import { createHash } from "node:crypto";

import Project from "../models/project.model.js";
import SpecVersion from "../models/specVersion.model.js";

import parseOpenApiDocument from "./openapi-parser.service.js";
import createExplorerCompleteness from "./analysis-completeness.service.js";

import AppError from "../utils/appError.js";

const MAX_VERSION_LABEL_LENGTH = 80;
const MAX_STORED_WARNINGS = 100;

const createProjectNotFoundError = () =>
  new AppError("Project not found.", {
    statusCode: 404,
    code: "RESOURCE_NOT_FOUND",
  });

const createVersionNotFoundError = () =>
  new AppError("Specification version not found.", {
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

const createDuplicateError = (message) =>
  new AppError(message, {
    statusCode: 409,
    code: "DUPLICATE_RESOURCE",
  });

const isValidObjectId = (value) => {
  return mongoose.isObjectIdOrHexString(value);
};

const normalizeVersionLabel = (label, defaultLabel) => {
  if (label === undefined) {
    label = defaultLabel;
  }

  if (typeof label !== "string") {
    throw createValidationError(
      "Version label must be a string.",
      "label"
    );
  }

  const normalizedLabel = label.trim();

  if (
    normalizedLabel.length === 0 ||
    normalizedLabel.length > MAX_VERSION_LABEL_LENGTH
  ) {
    throw createValidationError(
      `Version label must contain between 1 and ${MAX_VERSION_LABEL_LENGTH} characters.`,
      "label"
    );
  }

  return normalizedLabel;
};

const normalizeWarnings = (warnings = []) => {
  return warnings
    .slice(0, MAX_STORED_WARNINGS)
    .map((warning) => ({
      field: String(warning.field ?? "document").slice(0, 500),
      message: String(warning.message ?? "Parser warning.").slice(
        0,
        1000
      ),
    }));
};

const toPublicWarnings = (warnings = []) => {
  return warnings.map((warning) => ({
    field: warning.field,
    message: warning.message,
  }));
};

const toSpecificationVersionSummary = (specVersion) => ({
  id: specVersion._id.toString(),
  label: specVersion.label,
  openapiVersion: specVersion.openapiVersion,
  title: specVersion.title,
  sourceFormat: specVersion.sourceFormat,
  operationCount: specVersion.operationCount,
  parseStatus: specVersion.parseStatus,

  // Legacy records without this field are treated conservatively.
  explorerCompleteness:
    specVersion.explorerCompleteness ?? "PARTIAL",

  warnings: toPublicWarnings(specVersion.warnings),
  explorerWarnings: toPublicWarnings(
    specVersion.explorerWarnings
  ),

  createdAt: specVersion.createdAt,
});

const getDuplicateKeyMessage = (error) => {
  const keyPattern = error?.keyPattern ?? {};
  const message = error?.message ?? "";

  if (
    keyPattern.contentHash === 1 ||
    message.includes("uniq_specversions_project_hash")
  ) {
    return "This exact specification has already been uploaded to this project.";
  }

  if (
    keyPattern.label === 1 ||
    message.includes("uniq_specversions_project_label")
  ) {
    return "A specification version with this label already exists in this project.";
  }

  return "A specification version with this label or content already exists in this project.";
};

const createSpecificationVersion = async (
  ownerId,
  projectId,
  {
    sourceText,
    sourceFormat,
    label,
  }
) => {
  if (!isValidObjectId(ownerId)) {
    throw createValidationError(
      "A valid authenticated user ID is required.",
      "ownerId"
    );
  }

  if (!isValidObjectId(projectId)) {
    throw createValidationError(
      "A valid project ID is required.",
      "projectId"
    );
  }

  // Check project ownership before parsing the uploaded document.
  // Keep the transactional ownership check below as protection
  // against concurrent project deletion.
  const ownedProject = await Project.exists({
    _id: projectId,
    ownerId,
  });

  if (!ownedProject) {
    throw createProjectNotFoundError();
  }

  // Invalid or unsupported documents are never persisted.
  const parsedSpecification = await parseOpenApiDocument(
    sourceText,
    sourceFormat
  );

  // Explorer coverage is independent of parser diagnostics.
  const explorerAnalysis = createExplorerCompleteness(
    parsedSpecification.document,
    parsedSpecification.warnings
  );

  const normalizedLabel = normalizeVersionLabel(
    label,
    parsedSpecification.infoVersion
  );

  // Hash the exact original uploaded text, not a re-serialized
  // or normalized representation of the parsed document.
  const contentHash = createHash("sha256")
    .update(sourceText, "utf8")
    .digest("hex");

  const warnings = normalizeWarnings(
    parsedSpecification.warnings
  );

  const explorerWarnings = normalizeWarnings(
    explorerAnalysis.explorerWarnings
  );

  const session = await mongoose.startSession();

  let createdVersion;

  try {
    await session.withTransaction(
      async () => {
        // Verify ownership inside the transaction.
        const project = await Project.findOne({
          _id: projectId,
          ownerId,
        }).session(session);

        if (!project) {
          throw createProjectNotFoundError();
        }

        // Check duplicate content within this project.
        const existingContent = await SpecVersion.exists({
          projectId: project._id,
          contentHash,
        }).session(session);

        if (existingContent) {
          throw createDuplicateError(
            "This exact specification has already been uploaded to this project."
          );
        }

        // Check duplicate version labels within this project.
        const existingLabel = await SpecVersion.exists({
          projectId: project._id,
          label: normalizedLabel,
        }).session(session);

        if (existingLabel) {
          throw createDuplicateError(
            "A specification version with this label already exists in this project."
          );
        }

        const specVersion = new SpecVersion({
          projectId: project._id,
          uploadedBy: ownerId,
          label: normalizedLabel,
          openapiVersion: parsedSpecification.openapiVersion,
          title: parsedSpecification.title,
          sourceFormat: parsedSpecification.sourceFormat,
          sourceText,
          document: parsedSpecification.document,
          contentHash,
          operationCount: parsedSpecification.operationCount,
          parseStatus: "VALID",

          warnings,

          explorerCompleteness:
            explorerAnalysis.explorerCompleteness,

          explorerWarnings,
        });

        await specVersion.save({ session });

        // A specification upload counts as project activity.
        project.updatedAt = new Date();

        await project.save({ session });

        createdVersion = specVersion;
      },
      {
        readPreference: "primary",
      }
    );
  } catch (error) {
    // The unique indexes remain the final protection against
    // concurrent duplicate uploads.
    if (error?.code === 11000) {
      throw createDuplicateError(
        getDuplicateKeyMessage(error)
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }

  return toSpecificationVersionSummary(createdVersion);
};

const listSpecificationVersions = async (
  ownerId,
  projectId
) => {
  if (
    !isValidObjectId(ownerId) ||
    !isValidObjectId(projectId)
  ) {
    throw createValidationError(
      "A valid project ID is required.",
      "projectId"
    );
  }

  const project = await Project.exists({
    _id: projectId,
    ownerId,
  });

  if (!project) {
    throw createProjectNotFoundError();
  }

  const versions = await SpecVersion.find({
    projectId,
  })
    .select(
      "label openapiVersion title sourceFormat operationCount parseStatus warnings explorerCompleteness explorerWarnings createdAt"
    )
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .lean()
    .exec();

  return versions.map(toSpecificationVersionSummary);
};

// This function returns the complete internal record, including
// the parsed document and original source text. Controllers must
// explicitly select safe response fields before sending JSON.
const getSpecificationVersionRecord = async (
  ownerId,
  specVersionId
) => {
  if (
    !isValidObjectId(ownerId) ||
    !isValidObjectId(specVersionId)
  ) {
    throw createVersionNotFoundError();
  }

  const specVersion = await SpecVersion.findById(
    specVersionId
  )
    .lean()
    .exec();

  if (!specVersion) {
    throw createVersionNotFoundError();
  }

  const project = await Project.exists({
    _id: specVersion.projectId,
    ownerId,
  });

  if (!project) {
    throw createVersionNotFoundError();
  }

  return specVersion;
};

const specVersionService = {
  createSpecificationVersion,
  listSpecificationVersions,
  getSpecificationVersionRecord,
};

export default specVersionService;