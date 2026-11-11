
import express from "express";

import createTestCaseController from "../controllers/testCase.controller.js";
import createAuthMiddleware from "../middleware/auth.middleware.js";
import validateBody from "../middleware/validate.middleware.js";
import validateParams from "../middleware/validateParams.middleware.js";
import {
  createTestCaseSchema,
  specVersionTestCasesParamsSchema,
  testCaseParamsSchema,
  updateTestCaseSchema,
} from "../validators/testCase.validator.js";

const createTestCaseRouter = (config) => {
  const router = express.Router();
  const controller = createTestCaseController();

  const requireAuthentication = createAuthMiddleware(config);

  router.get(
    "/specifications/:specVersionId/test-cases",
    requireAuthentication,
    validateParams(specVersionTestCasesParamsSchema),
    controller.listTestCases
  );

  router.post(
    "/specifications/:specVersionId/test-cases",
    requireAuthentication,
    validateParams(specVersionTestCasesParamsSchema),
    validateBody(createTestCaseSchema),
    controller.createTestCase
  );

  router.get(
    "/test-cases/:testCaseId",
    requireAuthentication,
    validateParams(testCaseParamsSchema),
    controller.getTestCase
  );

  router.patch(
    "/test-cases/:testCaseId",
    requireAuthentication,
    validateParams(testCaseParamsSchema),
    validateBody(updateTestCaseSchema),
    controller.updateTestCase
  );

  router.post(
    "/test-cases/:testCaseId/approve",
    requireAuthentication,
    validateParams(testCaseParamsSchema),
    controller.approveTestCase
  );

  router.post(
    "/test-cases/:testCaseId/archive",
    requireAuthentication,
    validateParams(testCaseParamsSchema),
    controller.archiveTestCase
  );

  return router;
};

export default createTestCaseRouter;
