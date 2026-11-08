import express from "express";

import createProjectController from "../controllers/project.controller.js";

import createAuthMiddleware from "../middleware/auth.middleware.js";

import validateBody from "../middleware/validate.middleware.js";
import validateParams from "../middleware/validateParams.middleware.js";

import {
  createProjectSchema,
  projectIdSchema,
  updateProjectSchema,
} from "../validators/project.validator.js";

const createProjectRouter = (config) => {
  const router = express.Router();

  const controller = createProjectController();
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

  // Delete an owned project and its dependent records.
  router.delete(
    "/:projectId",
    validateParams(projectIdSchema),
    controller.deleteProject
  );

  return router;
};

export default createProjectRouter;