import mongoose from "mongoose";

import Project from "../models/project.model.js";

import AppError from "../utils/appError.js";

const DEPENDENT_COLLECTIONS = [
  "specversions",
  "diffreports",
  "testcases",
  "testruns",
];

const createProjectNotFoundError = () =>
  new AppError("Project not found.", {
    statusCode: 404,
    code: "RESOURCE_NOT_FOUND",
  });

// Convert a project name into a URL-safe slug.
const createSlugBase = (name) => {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

  return slug || "project";
};

const isSlugDuplicateError = (error) => {
  return (
    error?.code === 11000 &&
    (
      error.keyPattern?.slug === 1 ||
      error.message?.includes("uniq_projects_owner_slug")
    )
  );
};

const listProjects = async (ownerId) => {
  return Project.find({ ownerId })
    .sort({ updatedAt: -1 })
    .lean()
    .exec();
};

const createProject = async (
  ownerId,
  { name, description }
) => {
  const baseSlug = createSlugBase(name);

  // Retry with a numeric suffix if the owner already has
  // a project with the same generated slug.
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const suffixText = suffix === 1 ? "" : `-${suffix}`;

    const slug = (
      baseSlug.slice(0, 100 - suffixText.length) +
      suffixText
    );

    try {
      return await Project.create({
        ownerId,
        name,
        slug,
        ...(description !== undefined ? { description } : {}),
      });
    } catch (error) {
      if (isSlugDuplicateError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new AppError(
    "Unable to generate a unique project identifier.",
    {
      statusCode: 409,
      code: "PROJECT_SLUG_UNAVAILABLE",
    }
  );
};

const getProject = async (ownerId, projectId) => {
  const project = await Project.findOne({
    _id: projectId,
    ownerId,
  }).lean();

  if (!project) {
    throw createProjectNotFoundError();
  }

  return project;
};

const updateProject = async (
  ownerId,
  projectId,
  updates
) => {
  const project = await Project.findOne({
    _id: projectId,
    ownerId,
  });

  if (!project) {
    throw createProjectNotFoundError();
  }

  if (Object.hasOwn(updates, "name")) {
    project.name = updates.name;
  }

  if (Object.hasOwn(updates, "description")) {
    project.description = updates.description;
  }

  return project.save();
};

const deleteProject = async (ownerId, projectId) => {
  const database = mongoose.connection.db;

  // Only include dependent collections that already exist.
  // This avoids attempting transactional deletes against
  // collections that have not yet been created.
  const existingCollections = await database
    .listCollections({}, { nameOnly: true })
    .toArray();

  const existingNames = new Set(
    existingCollections.map((collection) => collection.name)
  );

  const collectionsToDelete = DEPENDENT_COLLECTIONS.filter(
    (name) => existingNames.has(name)
  );

  const session = await mongoose.startSession();

  let deletedProject;

  try {
    await session.withTransaction(
      async () => {
        const project = await Project.findOne({
          _id: projectId,
          ownerId,
        }).session(session);

        if (!project) {
          throw createProjectNotFoundError();
        }

        // Keep operations sequential inside the transaction.
        for (const collectionName of collectionsToDelete) {
          await database
            .collection(collectionName)
            .deleteMany(
              { projectId: project._id },
              { session }
            );
        }

        const result = await Project.deleteOne(
          {
            _id: project._id,
            ownerId,
          },
          { session }
        );

        if (result.deletedCount !== 1) {
          throw createProjectNotFoundError();
        }

        deletedProject = project;
      },
      {
        readPreference: "primary",
      }
    );
  } finally {
    await session.endSession();
  }

  return deletedProject;
};

const projectService = {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
};

export default projectService;