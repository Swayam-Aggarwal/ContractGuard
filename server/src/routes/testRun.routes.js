import express from "express";

import createTestRunController from "../controllers/testRun.controller.js";
import requireProjectOwnership from "../middleware/requireProjectOwnership.middleware.js";
import validateBody from "../middleware/validate.middleware.js";
import validateParams from "../middleware/validateParams.middleware.js";
import { testRunCreationRateLimiter } from "../middleware/testRunRateLimit.middleware.js";

import {
  createTestRunSchema,
  diffReportTestRunsParamsSchema,
  testRunParamsSchema,
} from "../validators/testRun.validator.js";

const createTestRunRouter = () => {
  const router = express.Router({ mergeParams: true });
  const controller = createTestRunController();

  router.get(
    "/",
    validateParams(diffReportTestRunsParamsSchema),
    requireProjectOwnership,
    controller.listTestRuns
  );

  router.post(
    "/",
    validateParams(diffReportTestRunsParamsSchema),
    requireProjectOwnership,
    testRunCreationRateLimiter,
    validateBody(createTestRunSchema),
    controller.createTestRun
  );

  router.get(
    "/:testRunId",
    validateParams(testRunParamsSchema),
    requireProjectOwnership,
    controller.getTestRun
  );

  return router;
};

export default createTestRunRouter;