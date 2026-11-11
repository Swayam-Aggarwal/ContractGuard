
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
import SpecVersion from "../src/models/specVersion.model.js";
import TestCase from "../src/models/testCase.model.js";
import createOperationIndex from "../src/services/openapi-operation-index.service.js";
import { hashPassword } from "../src/utils/password.js";

const TEST_DATABASE_NAME = "contractguard_test";
const TEST_DATABASE_USERNAME = "contractguard_test_user";
const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI;
const TEST_PASSWORD = "ContractGuard_Test_2026!";

const BASELINE_SPECIFICATION = {
  openapi: "3.0.3",
  info: {
    title: "Test Case API Fixture",
    version: "1.0.0",
  },
  paths: {
    "/records/{recordId}": {
      get: {
        operationId: "getRecord",
        parameters: [
          {
            name: "recordId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "includeHistory",
            in: "query",
            required: false,
            schema: { type: "boolean" },
          },
          {
            name: "tenant",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Record",
          },
        },
      },
    },
  },
};

const BASELINE_SOURCE = JSON.stringify(BASELINE_SPECIFICATION);
const config = {
  NODE_ENV: "test",
  APP_ORIGIN,
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "30m",
};

const app = createApp(config);
let databaseConnected = false;
let databaseReady = false;
let testPasswordHash;
let accountCounter = 0;

const clearTestDatabase = async () => {
  await TestCase.deleteMany({});
  await SpecVersion.deleteMany({});
  await Project.deleteMany({});
  await User.deleteMany({});
};

const createAccount = async () => {
  accountCounter += 1;
  const email = `test-case-user-${accountCounter}@example.com`;

  await User.create({
    email,
    passwordHash: testPasswordHash,
    displayName: "Test Case API User",
  });

  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/login")
    .set("Origin", APP_ORIGIN)
    .send({ email, password: TEST_PASSWORD })
    .expect(200);

  return agent;
};

const createProject = async (agent) => {
  const response = await agent
    .post("/api/v1/projects")
    .set("Origin", APP_ORIGIN)
    .send({
      name: "Test Case API Project",
      description: "Test case lifecycle integration tests.",
    })
    .expect(201);

  return response.body.data.project;
};

const uploadSpecification = async (agent, projectId) => {
  const response = await agent
    .post(`/api/v1/projects/${projectId}/specifications`)
    .set("Origin", APP_ORIGIN)
    .attach("file", Buffer.from(BASELINE_SOURCE, "utf8"), {
      filename: "baseline.json",
    })
    .expect(201);

  return response.body.data.specification;
};

const createWorkspace = async (agent) => {
  const project = await createProject(agent);
  const specification = await uploadSpecification(agent, project.id);
  const operation = createOperationIndex(BASELINE_SPECIFICATION).find(
    (entry) => entry.path === "/records/{recordId}" && entry.method === "GET"
  );

  return { project, specification, operation };
};

const createBody = (operation, overrides = {}) => ({
  operationKey: operation.operationKey,
  operationPath: operation.path,
  title: "Retrieve an existing record",
  description: "Verify the baseline GET request contract.",
  request: {
    pathParams: { recordId: "record-100" },
    queryParams: { includeHistory: "false", tenant: "north" },
  },
  assertions: {
    expectedStatus: 200,
    propertyAssertions: [],
    requiredProperties: ["id", "name"],
  },
  ...overrides,
});

beforeAll(async () => {
  if (!MONGODB_TEST_URI) {
    throw new Error("MONGODB_TEST_URI is required for test-case API integration tests.");
  }

  if (MONGODB_TEST_URI === process.env.MONGODB_URI) {
    throw new Error("Test-case API integration tests must use a separate test database.");
  }

  let parsedUri;
  try {
    parsedUri = new URL(MONGODB_TEST_URI);
  } catch {
    throw new Error("MONGODB_TEST_URI is not a valid MongoDB connection URI.");
  }

  if (
    !["mongodb+srv:", "mongodb:"].includes(parsedUri.protocol) ||
    decodeURIComponent(parsedUri.username) !== TEST_DATABASE_USERNAME
  ) {
    throw new Error("Test-case API integration tests must use the dedicated test database account.");
  }

  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is required for test-case API integration tests.");
  }

  User.schema.set("autoIndex", false);
  Project.schema.set("autoIndex", false);
  SpecVersion.schema.set("autoIndex", false);
  TestCase.schema.set("autoIndex", false);

  await mongoose.connect(MONGODB_TEST_URI, {
    dbName: TEST_DATABASE_NAME,
    serverSelectionTimeoutMS: 10000,
  });
  databaseConnected = true;

  await User.collection.createIndex(
    { email: 1 },
    { unique: true, name: "uniq_users_email" }
  );
  await Project.collection.createIndex(
    { ownerId: 1, updatedAt: -1 },
    { name: "idx_projects_owner_updated_at" }
  );
  await Project.collection.createIndex(
    { ownerId: 1, slug: 1 },
    { unique: true, name: "uniq_projects_owner_slug" }
  );
  await SpecVersion.collection.createIndex(
    { projectId: 1, contentHash: 1 },
    { unique: true, name: "uniq_specversions_project_hash" }
  );
  await SpecVersion.collection.createIndex(
    { projectId: 1, label: 1 },
    { unique: true, name: "uniq_specversions_project_label" }
  );

  testPasswordHash = await hashPassword(TEST_PASSWORD);
  await clearTestDatabase();
  databaseReady = true;
});

afterEach(async () => {
  if (databaseReady) await clearTestDatabase();
});

afterAll(async () => {
  if (!databaseConnected) return;

  try {
    if (databaseReady) await clearTestDatabase();
  } finally {
    await mongoose.disconnect();
    databaseConnected = false;
  }
});

describe("Test-case API integration", () => {
  it("creates, lists, edits, approves, and archives a baseline case", async () => {
    const agent = await createAccount();
    const { project, specification, operation } = await createWorkspace(agent);
    const endpoint = `/api/v1/specifications/${specification.id}/test-cases`;

    const createdResponse = await agent
      .post(endpoint)
      .set("Origin", APP_ORIGIN)
      .send(createBody(operation))
      .expect(201);

    const created = createdResponse.body.data.testCase;
    expect(created).toMatchObject({
      projectId: project.id,
      specVersionId: specification.id,
      operationKey: operation.operationKey,
      operationPath: "/records/{recordId}",
      status: "DRAFT",
      source: "MANUAL",
      request: {
        pathParams: { recordId: "record-100" },
        queryParams: { includeHistory: "false", tenant: "north" },
      },
    });
    expect(created).not.toHaveProperty("targetUrl");
    expect(created).not.toHaveProperty("headers");

    const listed = await agent.get(endpoint).expect(200);
    expect(listed.body.data.testCases).toHaveLength(1);
    expect(listed.body.data.testCases[0].id).toBe(created.id);

    const updated = await agent
      .patch(`/api/v1/test-cases/${created.id}`)
      .set("Origin", APP_ORIGIN)
      .send({ title: "Updated record retrieval case" })
      .expect(200);
    expect(updated.body.data.testCase.title).toBe("Updated record retrieval case");

    const approved = await agent
      .post(`/api/v1/test-cases/${created.id}/approve`)
      .set("Origin", APP_ORIGIN)
      .expect(200);
    expect(approved.body.data.testCase.status).toBe("APPROVED");
    expect(approved.body.data.testCase.approvedAt).toBeTruthy();

    const editApproved = await agent
      .patch(`/api/v1/test-cases/${created.id}`)
      .set("Origin", APP_ORIGIN)
      .send({ title: "This edit must be rejected" })
      .expect(409);
    expect(editApproved.body.error.code).toBe("TEST_CASE_STATE_CONFLICT");

    const archived = await agent
      .post(`/api/v1/test-cases/${created.id}/archive`)
      .set("Origin", APP_ORIGIN)
      .expect(200);
    expect(archived.body.data.testCase.status).toBe("ARCHIVED");

    const stored = await TestCase.findById(created.id).lean().exec();
    expect(stored.status).toBe("ARCHIVED");
  });

  it("rejects a missing required query parameter", async () => {
    const agent = await createAccount();
    const { specification, operation } = await createWorkspace(agent);
    const response = await agent
      .post(`/api/v1/specifications/${specification.id}/test-cases`)
      .set("Origin", APP_ORIGIN)
      .send(createBody(operation, {
        request: {
          pathParams: { recordId: "record-100" },
          queryParams: { includeHistory: "false" },
        },
      }))
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "request.queryParams.tenant",
        }),
      ])
    );
  });

  it("rejects undeclared parameters and unsafe request fields", async () => {
    const agent = await createAccount();
    const { specification, operation } = await createWorkspace(agent);
    const endpoint = `/api/v1/specifications/${specification.id}/test-cases`;

    const invalidParameter = await agent
      .post(endpoint)
      .set("Origin", APP_ORIGIN)
      .send(createBody(operation, {
        request: {
          pathParams: { recordId: "record-100" },
          queryParams: { arbitrary: "value" },
        },
      }))
      .expect(400);
    expect(invalidParameter.body.error.code).toBe("VALIDATION_ERROR");

    const unsafeRequest = await agent
      .post(endpoint)
      .set("Origin", APP_ORIGIN)
      .send(createBody(operation, {
        request: {
          pathParams: { recordId: "record-100" },
          queryParams: {},
          targetUrl: "https://example.invalid",
        },
      }))
      .expect(400);
    expect(unsafeRequest.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not expose another user's baseline cases", async () => {
    const owner = await createAccount();
    const otherUser = await createAccount();
    const { specification, operation } = await createWorkspace(owner);
    const endpoint = `/api/v1/specifications/${specification.id}/test-cases`;

    await owner
      .post(endpoint)
      .set("Origin", APP_ORIGIN)
      .send(createBody(operation))
      .expect(201);

    const response = await otherUser.get(endpoint).expect(404);
    expect(response.body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("requires authentication for test-case endpoints", async () => {
    const versionId = new mongoose.Types.ObjectId().toString();
    const response = await request(app)
      .get(`/api/v1/specifications/${versionId}/test-cases`)
      .expect(401);

    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });
});
