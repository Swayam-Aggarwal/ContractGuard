
import express from "express";

import createAiTestSuggestionController from
  "../controllers/aiTestSuggestion.controller.js";

import requireProjectOwnership from
  "../middleware/requireProjectOwnership.middleware.js";

import validateBody from
  "../middleware/validate.middleware.js";

import validateParams from
  "../middleware/validateParams.middleware.js";

import validateQuery from
  "../middleware/validateQuery.middleware.js";

import {
  aiTestSuggestionPreviewQuerySchema,
  aiTestSuggestionRequestSchema,
} from "../validators/aiTestSuggestion.validator.js";

import {
  diffReportParamsSchema,
} from "../validators/diffReport.validator.js";

import {
  aiTestSuggestionRateLimiter,
} from "../middleware/aiTestSuggestionRateLimit.middleware.js";

const createAiTestSuggestionRouter = (config) => {
  const router = express.Router({
    mergeParams: true,
  });

  const controller =
    createAiTestSuggestionController(config);

  /*
   * Both endpoints are nested beneath an authenticated project
   * and a specific comparison report.
   *
   * Project ownership is checked before either handler runs.
   */
  router.use(
    validateParams(diffReportParamsSchema),
    requireProjectOwnership
  );

  /*
   * Read-only preview.
   *
   * This endpoint constructs and returns the selected operation's
   * sanitized context. It does not contact Gemini.
   */
  router.get(
    "/preview",
    validateQuery(aiTestSuggestionPreviewQuerySchema),
    controller.getPreview
  );

  /*
   * Generation requires:
   * - A supported operationId.
   * - Explicit per-request consent.
   * - The AI suggestion rate limit.
   */
  router.post(
    "/",
    validateBody(aiTestSuggestionRequestSchema),
    aiTestSuggestionRateLimiter,
    controller.generateSuggestions
  );

  return router;
};

export default createAiTestSuggestionRouter;
