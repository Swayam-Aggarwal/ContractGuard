import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import healthRouter from "./routes/health.routes.js";
import createAuthRouter from "./routes/auth.routes.js";
import createProjectRouter from "./routes/project.routes.js";

import createOriginMiddleware from "./middleware/origin.middleware.js";
import notFound from "./middleware/notFound.middleware.js";
import errorHandler from "./middleware/error.middleware.js";

const createApp = (config) => {
  const app = express();

  const isProduction = config.NODE_ENV === "production";

  // Security-related HTTP headers.
  app.use(
    helmet(
      isProduction
        ? {}
        : {
            strictTransportSecurity: false,
            contentSecurityPolicy: {
              directives: {
                "upgrade-insecure-requests": null,
              },
            },
          }
    )
  );

  // Parse incoming JSON with a 16 KB limit.
  app.use(express.json({ limit: "16kb" }));

  // Parse authentication cookies.
  app.use(cookieParser());

  // Validate origins for state-changing requests.
  app.use(createOriginMiddleware(config.APP_ORIGIN));

  // API routes.
  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/auth", createAuthRouter(config));
  app.use("/api/v1/projects", createProjectRouter(config));

  // Unknown routes.
  app.use(notFound);

  // Centralized error handling.
  app.use(errorHandler);

  return app;
};

export default createApp;