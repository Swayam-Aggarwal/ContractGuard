import mongoose from "mongoose";
import request from "supertest";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import createApp from "../src/app.js";

import User from "../src/models/user.model.js";
import Project from "../src/models/project.model.js";

import { hashPassword } from "../src/utils/password.js";

const TEST_DATABASE_NAME = "contractguard_test";
const TEST_DATABASE_USERNAME = "contractguard_test_user";

const APP_ORIGIN =
  process.env.APP_ORIGIN || "http://localhost:5173";

const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI;

const TEST_PASSWORD = "ContractGuard_Test_2026!";

const DEPENDENT_COLLECTIONS = [
  "specversions",
  "diffreports",
  "testcases",
  "testruns",
];

const config = {
  NODE_ENV: "test",
  APP_ORIGIN,
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "30m",
};

const app = createApp(config);

let databaseConnected = false;
let databaseReady = false;

const clearTestDatabase = async () => {
  await Project.deleteMany({});
  await User.deleteMany({});

  const collections = await mongoose.connection.db
    .listCollections({}, { nameOnly: true })
    .toArray();

  const existingNames = new Set(
    collections.map((collection) => collection.name)
  );

  for (const name of DEPENDENT_COLLECTIONS) {
    if (existingNames.has(name)) {
      await mongoose.connection.db
        .collection(name)
        .deleteMany({});
    }
  }
};

const createAccount = async (email) => {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  await User.create({
    email,
    passwordHash,
    displayName: "Project Test User",
  });

  const agent = request.agent(app);

  await agent
    .post("/api/v1/auth/login")
    .set("Origin", APP_ORIGIN)
    .send({
      email,
      password: TEST_PASSWORD,
    })
    .expect(200);

  return agent;
};

// IMPORTANT: This helper is deliberately NOT async.
// It returns the Supertest request directly, allowing
// callers to use .expect() and await the actual response.
const createProject = (
  agent,
  name = "ContractGuard API",
  description = "Project integration test"
) => {
  return agent
    .post("/api/v1/projects")
    .set("Origin", APP_ORIGIN)
    .send({
      name,
      description,
    });
};

beforeAll(async () => {
  if (!MONGODB_TEST_URI) {
    throw new Error(
      "MONGODB_TEST_URI is required for project integration tests."
    );
  }

  if (MONGODB_TEST_URI === process.env.MONGODB_URI) {
    throw new Error(
      "Project integration tests must use a separate test database connection."
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
      "Project integration tests must use the dedicated test database user."
    );
  }

  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is required for project integration tests."
    );
  }

  // Manage indexes explicitly during integration tests.
  User.schema.set("autoIndex", false);
  Project.schema.set("autoIndex", false);

  await mongoose.connect(MONGODB_TEST_URI, {
    dbName: TEST_DATABASE_NAME,
    serverSelectionTimeoutMS: 10000,
  });

  databaseConnected = true;

  // User email uniqueness.
  await User.collection.createIndex(
    { email: 1 },
    {
      unique: true,
      name: "uniq_users_email",
    }
  );

  // Project listing index.
  await Project.collection.createIndex(
    { ownerId: 1, updatedAt: -1 },
    {
      name: "idx_projects_owner_updated_at",
    }
  );

  // Owner-scoped unique slug index.
  await Project.collection.createIndex(
    { ownerId: 1, slug: 1 },
    {
      unique: true,
      name: "uniq_projects_owner_slug",
    }
  );

  // Remove leftover data from an interrupted previous run.
  await clearTestDatabase();

  databaseReady = true;
});

afterEach(async () => {
  if (databaseReady) {
    await clearTestDatabase();
  }
});

afterAll(async () => {
  if (databaseConnected) {
    await mongoose.disconnect();
    databaseConnected = false;
  }
});

describe("Project management integration", () => {
  it("should reject project access without authentication", async () => {
    const response = await request(app)
      .get("/api/v1/projects")
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("should create a project for the authenticated user", async () => {
    const agent = await createAccount(
      "project-create@example.com"
    );

    const response = await createProject(
      agent,
      "  ContractGuard API  ",
      "  API compatibility project  "
    ).expect(201);

    const project = response.body.data.project;

    expect(project).toMatchObject({
      name: "ContractGuard API",
      slug: "contractguard-api",
      description: "API compatibility project",
    });

    expect(project.id).toBeDefined();
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();

    expect(project).not.toHaveProperty("ownerId");
  });

  it("should generate unique slugs for projects with the same name", async () => {
    const agent = await createAccount(
      "project-slug@example.com"
    );

    const first = await createProject(
      agent,
      "ContractGuard API"
    ).expect(201);

    const second = await createProject(
      agent,
      "ContractGuard API"
    ).expect(201);

    expect(first.body.data.project.slug).toBe(
      "contractguard-api"
    );

    expect(second.body.data.project.slug).toBe(
      "contractguard-api-2"
    );
  });

  it("should list only projects belonging to the authenticated user", async () => {
    const owner = await createAccount(
      "project-owner@example.com"
    );

    const otherUser = await createAccount(
      "project-other@example.com"
    );

    const ownerProject = await createProject(
      owner,
      "Owner Project"
    ).expect(201);

    await createProject(
      otherUser,
      "Other User Project"
    ).expect(201);

    const response = await owner
      .get("/api/v1/projects")
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.projects).toHaveLength(1);

    expect(response.body.data.projects[0].id).toBe(
      ownerProject.body.data.project.id
    );

    expect(response.body.data.projects[0].name).toBe(
      "Owner Project"
    );
  });

  it("should prevent one user from retrieving, editing or deleting another user's project", async () => {
    const owner = await createAccount(
      "project-private-owner@example.com"
    );

    const otherUser = await createAccount(
      "project-private-other@example.com"
    );

    const created = await createProject(
      owner,
      "Private Project"
    ).expect(201);

    const projectId = created.body.data.project.id;

    await otherUser
      .get(`/api/v1/projects/${projectId}`)
      .expect(404);

    await otherUser
      .patch(`/api/v1/projects/${projectId}`)
      .set("Origin", APP_ORIGIN)
      .send({
        name: "Unauthorized Rename",
      })
      .expect(404);

    await otherUser
      .delete(`/api/v1/projects/${projectId}`)
      .set("Origin", APP_ORIGIN)
      .expect(404);

    const original = await owner
      .get(`/api/v1/projects/${projectId}`)
      .expect(200);

    expect(original.body.data.project.name).toBe(
      "Private Project"
    );
  });

  it("should update a project without changing its original slug", async () => {
    const agent = await createAccount(
      "project-update@example.com"
    );

    const created = await createProject(
      agent,
      "Original Project",
      "Original description"
    ).expect(201);

    const projectId = created.body.data.project.id;
    const originalSlug = created.body.data.project.slug;

    const response = await agent
      .patch(`/api/v1/projects/${projectId}`)
      .set("Origin", APP_ORIGIN)
      .send({
        name: "Updated Project",
        description: "",
      })
      .expect(200);

    expect(response.body.data.project.name).toBe(
      "Updated Project"
    );

    expect(response.body.data.project.slug).toBe(
      originalSlug
    );

    expect(response.body.data.project.description).toBeNull();
  });

  it("should reject invalid project input and unknown ownership fields", async () => {
    const agent = await createAccount(
      "project-validation@example.com"
    );

    const user = await User.findOne({
      email: "project-validation@example.com",
    });

    await agent
      .post("/api/v1/projects")
      .set("Origin", APP_ORIGIN)
      .send({
        name: "Invalid Project",
        ownerId: user._id.toString(),
      })
      .expect(400);

    await agent
      .post("/api/v1/projects")
      .set("Origin", APP_ORIGIN)
      .send({
        name: "   ",
      })
      .expect(400);

    await agent
      .patch("/api/v1/projects/507f1f77bcf86cd799439011")
      .set("Origin", APP_ORIGIN)
      .send({})
      .expect(400);

    await agent
      .get("/api/v1/projects/not-a-valid-object-id")
      .expect(400);

    expect(await Project.countDocuments({})).toBe(0);
  });

  it("should delete a project and its dependent records transactionally", async () => {
    const owner = await createAccount(
      "project-delete-owner@example.com"
    );

    const otherUser = await createAccount(
      "project-delete-other@example.com"
    );

    const targetResponse = await createProject(
      owner,
      "Project To Delete"
    ).expect(201);

    const retainedResponse = await createProject(
      otherUser,
      "Project To Retain"
    ).expect(201);

    const targetId = new mongoose.Types.ObjectId(
      targetResponse.body.data.project.id
    );

    const retainedId = new mongoose.Types.ObjectId(
      retainedResponse.body.data.project.id
    );

    const database = mongoose.connection.db;

    // Seed dependent records for both projects.
    for (const collectionName of DEPENDENT_COLLECTIONS) {
      await database.collection(collectionName).insertMany([
        {
          projectId: targetId,
          marker: "delete",
        },
        {
          projectId: retainedId,
          marker: "retain",
        },
      ]);
    }

    const response = await owner
      .delete(`/api/v1/projects/${targetId}`)
      .set("Origin", APP_ORIGIN)
      .expect(200);

    expect(response.body.success).toBe(true);

    expect(response.body.data.message).toBe(
      "Project deleted successfully."
    );

    expect(
      await Project.findById(targetId)
    ).toBeNull();

    expect(
      await Project.findById(retainedId)
    ).not.toBeNull();

    // Verify only the target project's dependent records
    // were deleted.
    for (const collectionName of DEPENDENT_COLLECTIONS) {
      const collection = database.collection(collectionName);

      expect(
        await collection.countDocuments({
          projectId: targetId,
        })
      ).toBe(0);

      expect(
        await collection.countDocuments({
          projectId: retainedId,
        })
      ).toBe(1);
    }
  });
});