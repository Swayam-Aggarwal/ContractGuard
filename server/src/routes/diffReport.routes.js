import express from "express";

import createDiffReportController from
  "../controllers/diffReport.controller.js";
import createTestRunRouter from "./testRun.routes.js";

import requireProjectOwnership from
  "../middleware/requireProjectOwnership.middleware.js";

import validateBody from
  "../middleware/validate.middleware.js";

import validateParams from
  "../middleware/validateParams.middleware.js";

import validateQuery from
  "../middleware/validateQuery.middleware.js";

import {
  projectIdSchema,
} from "../validators/project.validator.js";

import {
  createDiffReportSchema,
  diffReportParamsSchema,
  listDiffReportsQuerySchema,
} from "../validators/diffReport.validator.js";

const createDiffReportRouter = () => {
  const router = express.Router({
    mergeParams: true,
  });

  const controller = createDiffReportController();

  router.post(
    "/",
    validateParams(projectIdSchema),
    requireProjectOwnership,
    validateBody(createDiffReportSchema),
    controller.createDiffReport
  );

  router.get(
    "/",
    validateParams(projectIdSchema),
    requireProjectOwnership,
    validateQuery(listDiffReportsQuerySchema),
    controller.listDiffReports
  );

  router.use(
    "/:reportId/test-runs",
    createTestRunRouter()
  );

  router.get(
    "/:reportId",
    validateParams(diffReportParamsSchema),
    requireProjectOwnership,
    controller.getDiffReport
  );

  return router;
};

export default createDiffReportRouter;