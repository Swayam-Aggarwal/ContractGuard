import express from "express";

import createAuthController from "../controllers/auth.controller.js";

import createAuthMiddleware from "../middleware/auth.middleware.js";

import {
  loginRateLimiter,
  registrationRateLimiter,
} from "../middleware/authRateLimit.middleware.js";

import validateBody from "../middleware/validate.middleware.js";

import {
  loginSchema,
  registerSchema,
} from "../validators/auth.validator.js";

const createAuthRouter = (config) => {
  const router = express.Router();

  const controller = createAuthController(config);

  const requireAuth = createAuthMiddleware(config);

  router.post(
    "/register",
    registrationRateLimiter,
    validateBody(registerSchema),
    controller.register
  );

  router.post(
    "/login",
    loginRateLimiter,
    validateBody(loginSchema),
    controller.login
  );

  router.post(
  "/logout",
  controller.logout
  );

  router.get(
    "/me",
    requireAuth,
    controller.getCurrentUser
  );

  return router;
};

export default createAuthRouter;