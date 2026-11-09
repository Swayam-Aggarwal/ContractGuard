
import express from "express";

import createProjectController from
  "../controllers/project.controller.js";

import createSpecVersionController from
  "../controllers/specVersion.controller.js";

import createDiffReportRouter from
  "./diffReport.routes.js";

import createAuthMiddleware from
  "../middleware/auth.middleware.js";

import requireProjectOwnership from
  "../middleware/requireProjectOwnership.middleware.js";

import uploadSpecificationFile from
  "../middleware/specificationUpload.middleware.js";

import validateBody from
  "../middleware/validate.middleware.js";

import validateParams from
  "../middleware/validateParams.middleware.js";

import {
  createProjectSchema,
  projectIdSchema,
  updateProjectSchema,
} from "../validators/project.validator.js";

import {
  uploadSpecificationSchema,
} from "../validators/specVersion.validator.js";

const createProjectRouter = (config) => {
  const router = express.Router();

  const controller = createProjectController();
  const specVersionController = createSpecVersionController();

  const diffReportRouter = createDiffReportRouter();

  const requireAuth = createAuthMiddleware(config);

  // Every project endpoint requires an authenticated user.
  router.use(requireAuth);

  // List projects belonging to the current user.
  router.get(
    "/",
    controller.listProjects
  );

  // Create a project for the current user.
  router.post(
    "/",
    validateBody(createProjectSchema),
    controller.createProject
  );

  // Upload a specification to a project.
  // Verify ownership before processing the uploaded file.
  router.post(
    "/:projectId/specifications",
    validateParams(projectIdSchema),
    requireProjectOwnership,
    uploadSpecificationFile,
    validateBody(uploadSpecificationSchema),
    specVersionController.uploadSpecification
  );

  // List specification versions belonging to an owned project.
  router.get(
    "/:projectId/specifications",
    validateParams(projectIdSchema),
    specVersionController.listSpecificationVersions
  );

  // Comparison reports for an owned project.
  router.use(
    "/:projectId/diff-reports",
    diffReportRouter
  );

  // Retrieve one owned project.
  router.get(
    "/:projectId",
    validateParams(projectIdSchema),
    controller.getProject
  );

  // Update an owned project.
  router.patch(
    "/:projectId",
    validateParams(projectIdSchema),
    validateBody(updateProjectSchema),
    controller.updateProject
  );

  // Delete an owned project and dependent records.
  router.delete(
    "/:projectId",
    validateParams(projectIdSchema),
    controller.deleteProject
  );

  return router;
};

export default createProjectRouter;
