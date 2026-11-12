import { rateLimit } from "express-rate-limit";

export const testRunCreationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: {
        code: "TEST_RUN_RATE_LIMITED",
        message: "Too many regression runs have been requested. Please try again later.",
        details: [],
      },
    }),
});