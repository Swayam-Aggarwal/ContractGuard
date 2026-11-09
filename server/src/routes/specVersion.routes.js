
import express from "express";

import createSpecVersionController from
  "../controllers/specVersion.controller.js";

import createAuthMiddleware from
  "../middleware/auth.middleware.js";

import validateParams from
  "../middleware/validateParams.middleware.js";

import validateQuery from
  "../middleware/validateQuery.middleware.js";

import {
  specVersionIdSchema,
  specVersionOperationParamsSchema,
  specVersionComponentTypeParamsSchema,
  specVersionComponentParamsSchema,
  specVersionReferenceQuerySchema,
} from "../validators/specVersion.validator.js";

const createSpecVersionRouter = (config) => {
  const router = express.Router();

  const controller = createSpecVersionController();
  const requireAuth = createAuthMiddleware(config);

  router.use(requireAuth);

  // List operations extracted from a specification version.
  router.get(
    "/:specVersionId/operations",
    validateParams(specVersionIdSchema),
    controller.listSpecificationOperations
  );

  // Retrieve the details of one operation.
  router.get(
    "/:specVersionId/operations/:operationKey",
    validateParams(specVersionOperationParamsSchema),
    controller.getSpecificationOperation
  );

  // List components belonging to a particular category.
  router.get(
    "/:specVersionId/components/:componentType",
    validateParams(specVersionComponentTypeParamsSchema),
    controller.listSpecificationComponents
  );

  // Retrieve one reusable component.
  router.get(
    "/:specVersionId/components/:componentType/:componentName",
    validateParams(specVersionComponentParamsSchema),
    controller.getSpecificationComponent
  );

  // Resolve an internal JSON Pointer reference.
  router.get(
    "/:specVersionId/references",
    validateParams(specVersionIdSchema),
    validateQuery(specVersionReferenceQuerySchema),
    controller.getSpecificationReference
  );

  // Retrieve the complete specification version.
  // Keep this route last so it does not intercept explorer routes.
  router.get(
    "/:specVersionId",
    validateParams(specVersionIdSchema),
    controller.getSpecificationVersion
  );

  return router;
};

export default createSpecVersionRouter;
