import { rateLimit } from "express-rate-limit";

export const aiTestSuggestionRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,

  limit: 3,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  handler: (_req, res) =>
    res.status(429).json({
      success: false,

      error: {
        code: "AI_SUGGESTION_RATE_LIMITED",

        message:
          "You have reached the limit of three AI suggestion requests per hour.",

        details: [],
      },
    }),
});

export default aiTestSuggestionRateLimiter;