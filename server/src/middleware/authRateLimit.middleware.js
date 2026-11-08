import { rateLimit } from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

const createRateLimitHandler = (message) => {
  return (req, res) => {
    return res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message,
        details: [],
      },
    });
  };
};

// Limit account registrations by IP
export const registrationRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  handler: createRateLimitHandler(
    "Too many registration attempts. Please try again later."
  ),
});

// Limit failed login attempts by IP
export const loginRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,

  handler: createRateLimitHandler(
    "Too many login attempts. Please try again later."
  ),
});