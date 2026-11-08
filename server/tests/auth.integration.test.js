
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import createApp from "../src/app.js";
import User from "../src/models/user.model.js";

import {
  AUTH_COOKIE_NAME,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from "../src/config/auth.js";

import {
  hashPassword,
  verifyPassword,
} from "../src/utils/password.js";

vi.setConfig({
  testTimeout: 20000,
  hookTimeout: 30000,
});

const TEST_DATABASE_NAME = "contractguard_test";
const TEST_DATABASE_USERNAME = "contractguard_test_user";

const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI;

const APP_ORIGIN =
  process.env.APP_ORIGIN || "http://localhost:5173";

const JWT_SECRET = process.env.JWT_SECRET;

const VALID_PASSWORD = "ContractGuard_Test_2026!";

const config = {
  NODE_ENV: "test",
  APP_ORIGIN,
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "30m",
};

const app = createApp(config);

let databaseConnected = false;
let databaseReady = false;

const createTestUser = async (
  email = "test@example.com"
) => {
  const passwordHash = await hashPassword(VALID_PASSWORD);

  return User.create({
    email,
    passwordHash,
    displayName: "Test User",
  });
};

const registerRequest = (
  email,
  password = VALID_PASSWORD
) =>
  request(app)
    .post("/api/v1/auth/register")
    .set("Origin", APP_ORIGIN)
    .send({
      email,
      password,
      displayName: "Test User",
    });

beforeAll(async () => {
  if (!MONGODB_TEST_URI) {
    throw new Error(
      "MONGODB_TEST_URI is required for authentication integration tests."
    );
  }

  if (MONGODB_TEST_URI === process.env.MONGODB_URI) {
    throw new Error(
      "Integration tests must use a separate test database connection."
    );
  }

  let parsedUri;

  try {
    parsedUri = new URL(MONGODB_TEST_URI);
  } catch {
    throw new Error(
      "MONGODB_TEST_URI is not a valid MongoDB connection URI."
    );
  }

  if (
    !["mongodb+srv:", "mongodb:"].includes(parsedUri.protocol) ||
    decodeURIComponent(parsedUri.username) !==
      TEST_DATABASE_USERNAME
  ) {
    throw new Error(
      "Integration tests must use the dedicated contractguard_test_user account."
    );
  }

  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is required for authentication integration tests."
    );
  }

  // Disable automatic index creation so this suite creates
  // the required unique index explicitly and deterministically.
  User.schema.set("autoIndex", false);

  // Connect exclusively to the dedicated test database.
  await mongoose.connect(MONGODB_TEST_URI, {
    dbName: TEST_DATABASE_NAME,
    serverSelectionTimeoutMS: 10000,
  });

  databaseConnected = true;

  // Ensure the unique email index exists.
  await User.collection.createIndex(
    { email: 1 },
    {
      unique: true,
      name: "uniq_users_email",
    }
  );

  // Clean up records left by an interrupted test run.
  await User.deleteMany({});

  databaseReady = true;
});

afterEach(async () => {
  if (databaseReady) {
    await User.deleteMany({});
  }
});

afterAll(async () => {
  if (databaseConnected) {
    try {
      if (databaseReady) {
        await User.deleteMany({});
      }
    } finally {
      await mongoose.disconnect();
      databaseConnected = false;
    }
  }
});

describe("Authentication integration", () => {
  it("should register a user and store a bcrypt password hash", async () => {
    const response = await registerRequest(
      "register@example.com"
    ).expect(201);

    expect(response.body.success).toBe(true);

    expect(response.body.data.user).toMatchObject({
      email: "register@example.com",
      displayName: "Test User",
    });

    expect(response.body.data.user).not.toHaveProperty(
      "password"
    );

    expect(response.body.data.user).not.toHaveProperty(
      "passwordHash"
    );

    const storedUser = await User.findOne({
      email: "register@example.com",
    }).select("+passwordHash");

    expect(storedUser).not.toBeNull();

    expect(storedUser.passwordHash).toMatch(
      /^\$2[ab]\$12\$/
    );

    expect(
      await verifyPassword(
        VALID_PASSWORD,
        storedUser.passwordHash
      )
    ).toBe(true);

    const cookies = response.headers["set-cookie"] ?? [];

    const authCookie = cookies.find((cookie) =>
      cookie.startsWith(`${AUTH_COOKIE_NAME}=`)
    );

    expect(authCookie).toBeDefined();
    expect(authCookie.toLowerCase()).toContain("httponly");
    expect(authCookie.toLowerCase()).toContain("samesite=lax");
    expect(authCookie.toLowerCase()).toContain("path=/api/v1");
  });

  it("should reject duplicate email registration", async () => {
    await registerRequest("duplicate@example.com").expect(201);

    const response = await registerRequest(
      "DUPLICATE@example.com"
    ).expect(409);

    expect(response.body.success).toBe(false);

    expect(response.body.error.code).toBe(
      "DUPLICATE_RESOURCE"
    );
  });

  it("should log in and return the authenticated user", async () => {
    const user = await createTestUser(
      "login@example.com"
    );

    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({
        email: "login@example.com",
        password: VALID_PASSWORD,
      })
      .expect(200);

    expect(loginResponse.body.success).toBe(true);

    expect(loginResponse.body.data.user.id).toBe(
      user._id.toString()
    );

    const meResponse = await agent
      .get("/api/v1/auth/me")
      .expect(200);

    expect(meResponse.body.data.user).toMatchObject({
      id: user._id.toString(),
      email: "login@example.com",
      displayName: "Test User",
    });

    expect(meResponse.body.data.user).not.toHaveProperty(
      "passwordHash"
    );
  });

  it("should clear the authentication cookie on logout", async () => {
    await createTestUser("logout@example.com");

    const agent = request.agent(app);

    await agent
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({
        email: "logout@example.com",
        password: VALID_PASSWORD,
      })
      .expect(200);

    const response = await agent
      .post("/api/v1/auth/logout")
      .set("Origin", APP_ORIGIN)
      .expect(200);

    expect(response.body.success).toBe(true);

    const cookies = response.headers["set-cookie"] ?? [];

    const clearedCookie = cookies.find((cookie) =>
      cookie.startsWith(`${AUTH_COOKIE_NAME}=`)
    );

    expect(clearedCookie).toBeDefined();

    expect(clearedCookie.toLowerCase()).toContain(
      "path=/api/v1"
    );

    await agent
      .get("/api/v1/auth/me")
      .expect(401);
  });

  it("should allow logout without an authenticated session", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", APP_ORIGIN)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("should return the same error for incorrect and nonexistent credentials", async () => {
    await createTestUser("existing@example.com");

    const incorrectPassword = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({
        email: "existing@example.com",
        password: "Incorrect_Test_Password_2026!",
      })
      .expect(401);

    const nonexistentUser = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({
        email: "missing@example.com",
        password: VALID_PASSWORD,
      })
      .expect(401);

    expect(nonexistentUser.body).toEqual(
      incorrectPassword.body
    );

    expect(incorrectPassword.body.error.code).toBe(
      "AUTH_REQUIRED"
    );
  });

  it("should reject a JWT with an invalid signature", async () => {
    const invalidToken = jwt.sign(
      {},
      "incorrect-test-secret",
      {
        algorithm: JWT_ALGORITHM,
        subject: new mongoose.Types.ObjectId().toString(),
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: "30m",
      }
    );

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set(
        "Cookie",
        `${AUTH_COOKIE_NAME}=${invalidToken}`
      )
      .expect(401);

    expect(response.body.error.code).toBe(
      "AUTH_REQUIRED"
    );
  });

  it("should reject an expired JWT", async () => {
    const expiredToken = jwt.sign(
      {},
      Buffer.from(JWT_SECRET, "base64url"),
      {
        algorithm: JWT_ALGORITHM,
        subject: new mongoose.Types.ObjectId().toString(),
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: -1,
      }
    );

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set(
        "Cookie",
        `${AUTH_COOKIE_NAME}=${expiredToken}`
      )
      .expect(401);

    expect(response.body.error.code).toBe(
      "AUTH_REQUIRED"
    );
  });
});
