import jwt from "jsonwebtoken";

import User from "../models/user.model.js";

import {
  AUTH_COOKIE_NAME,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  getAuthCookieOptions,
  getClearAuthCookieOptions,
} from "../config/auth.js";

import AppError from "../utils/appError.js";

import {
  hashPassword,
  verifyPassword,
} from "../utils/password.js";

const toPublicUser = (user) => ({
  id: user._id.toString(),
  email: user.email,
  displayName: user.displayName ?? null,
  createdAt: user.createdAt,
});

const createAuthController = (config) => {
  const signingKey = Buffer.from(
    config.JWT_SECRET,
    "base64url"
  );

  const setAuthCookie = (res, user) => {
    const token = jwt.sign(
      {},
      signingKey,
      {
        algorithm: JWT_ALGORITHM,
        expiresIn: config.JWT_EXPIRES_IN,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        subject: user._id.toString(),
      }
    );

    res.cookie(
      AUTH_COOKIE_NAME,
      token,
      getAuthCookieOptions(config.NODE_ENV)
    );
  };

  const register = async (req, res) => {
    const { email, password, displayName } = req.body;

    const passwordHash = await hashPassword(password);

    let user;

    try {
      user = await User.create({
        email,
        passwordHash,
        ...(displayName ? { displayName } : {}),
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw new AppError(
          "An account with this email already exists.",
          {
            statusCode: 409,
            code: "DUPLICATE_RESOURCE",
          }
        );
      }

      throw error;
    }

    setAuthCookie(res, user);

    return res.status(201).json({
      success: true,
      data: {
        user: toPublicUser(user),
      },
    });
  };

  const login = async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select(
      "+passwordHash"
    );

    const passwordIsValid = user
      ? await verifyPassword(password, user.passwordHash)
      : false;

    if (!passwordIsValid) {
      throw new AppError(
        "Email or password is incorrect.",
        {
          statusCode: 401,
          code: "AUTH_REQUIRED",
        }
      );
    }

    setAuthCookie(res, user);

    return res.status(200).json({
      success: true,
      data: {
        user: toPublicUser(user),
      },
    });
  };

  const getCurrentUser = async (req, res) => {
    const user = await User.findById(req.user.id).select(
      "_id email displayName createdAt"
    );

    if (!user) {
      throw new AppError("Authentication is required.", {
        statusCode: 401,
        code: "AUTH_REQUIRED",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user: toPublicUser(user),
      },
    });
  };

  const logout = (req, res) => {
    res.clearCookie(
      AUTH_COOKIE_NAME,
      getClearAuthCookieOptions(config.NODE_ENV)
    );

    return res.status(200).json({
      success: true,
      data: {
        message: "Logged out successfully.",
      },
    });
  };

  return {
    register,
    login,
    getCurrentUser,
    logout,
  };
};

export default createAuthController;