import mongoose from "mongoose";

import Project from "../models/project.model.js";
import AppError from "../utils/appError.js";

const createProjectNotFoundError = () =>
  new AppError("Project not found.", {
    statusCode: 404,
    code: "RESOURCE_NOT_FOUND",
  });

const requireProjectOwnership = async (req, res, next) => {
  const projectId =
    req.validatedParams?.projectId ?? req.params?.projectId;

  const ownerId = req.user?.id;

  if (
    !mongoose.isObjectIdOrHexString(projectId) ||
    !mongoose.isObjectIdOrHexString(ownerId)
  ) {
    throw createProjectNotFoundError();
  }

  const project = await Project.exists({
    _id: projectId,
    ownerId,
  });

  if (!project) {
    throw createProjectNotFoundError();
  }

  req.authorizedProjectId = project._id.toString();

  return next();
};

export default requireProjectOwnership;
