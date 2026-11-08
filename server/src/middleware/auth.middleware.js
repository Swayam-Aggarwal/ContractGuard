import jwt from "jsonwebtoken";

import {
  AUTH_COOKIE_NAME,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from "../config/auth.js";

import AppError from "../utils/appError.js";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const createAuthMiddleware = (config) => {
  // Use the same decoded key representation as the JWT signer.
  const signingKey = Buffer.from(
    config.JWT_SECRET,
    "base64url"
  );

  return (req, res, next) => {
    const token = req.cookies?.[AUTH_COOKIE_NAME];

    if (typeof token !== "string" || token.length === 0) {
      return next(
        new AppError("Authentication is required.", {
          statusCode: 401,
          code: "AUTH_REQUIRED",
        })
      );
    }

    try {
      const payload = jwt.verify(token, signingKey, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      if (
        typeof payload !== "object" ||
        payload === null ||
        typeof payload.sub !== "string" ||
        !OBJECT_ID_PATTERN.test(payload.sub) ||
        !Number.isFinite(payload.exp)
      ) {
        throw new Error("Invalid authentication claims.");
      }

      req.user = {
        id: payload.sub,
      };

      return next();
    } catch {
      return next(
        new AppError("Authentication is required.", {
          statusCode: 401,
          code: "AUTH_REQUIRED",
        })
      );
    }
  };
};

export default createAuthMiddleware;