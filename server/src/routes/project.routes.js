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

  const specVersionController =
    createSpecVersionController();

  const diffReportRouter =
    createDiffReportRouter(config);

  const requireAuth =
    createAuthMiddleware(config);

  // All project endpoints require an authenticated user.
  router.use(requireAuth);

  router.get(
    "/",
    controller.listProjects
  );

  router.post(
    "/",
    validateBody(createProjectSchema),
    controller.createProject
  );

  router.post(
    "/:projectId/specifications",
    validateParams(projectIdSchema),
    requireProjectOwnership,
    uploadSpecificationFile,
    validateBody(uploadSpecificationSchema),
    specVersionController.uploadSpecification
  );

  router.get(
    "/:projectId/specifications",
    validateParams(projectIdSchema),
    specVersionController.listSpecificationVersions
  );

  // The nested report router also receives the optional AI configuration.
  router.use(
    "/:projectId/diff-reports",
    diffReportRouter
  );

  router.get(
    "/:projectId",
    validateParams(projectIdSchema),
    controller.getProject
  );

  router.patch(
    "/:projectId",
    validateParams(projectIdSchema),
    validateBody(updateProjectSchema),
    controller.updateProject
  );

  router.delete(
    "/:projectId",
    validateParams(projectIdSchema),
    controller.deleteProject
  );

  return router;
};

export default createProjectRouter;