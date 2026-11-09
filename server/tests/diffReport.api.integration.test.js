
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
import DiffReport from "../src/models/diffReport.model.js";

import { hashPassword } from "../src/utils/password.js";

const TEST_DATABASE_NAME = "contractguard_test";
const TEST_DATABASE_USERNAME = "contractguard_test_user";

const APP_ORIGIN =
  process.env.APP_ORIGIN || "http://localhost:5173";

const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI;

const TEST_PASSWORD = "ContractGuard_Test_2026!";

const BASELINE_SPECIFICATION = {
  openapi: "3.2.1",

  info: {
    title: "ContractGuard Comparison Test API",
    version: "1.0.0",
  },

  paths: {
    "/products": {
      get: {
        operationId: "listProducts",

        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
            },
          },
        ],

        responses: {
          "200": {
            description: "Product list.",
          },

          "404": {
            description: "Products not found.",
          },
        },
      },
    },

    "/legacy": {
      get: {
        operationId: "getLegacy",

        responses: {
          "200": {
            description: "Legacy response.",
          },
        },
      },
    },
  },
};

const CANDIDATE_SPECIFICATION = {
  openapi: "3.2.1",

  info: {
    title: "ContractGuard Comparison Test API",
    version: "2.0.0",
  },

  paths: {
    "/products": {
      get: {
        operationId: "listProducts",

        parameters: [
          {
            name: "limit",
            in: "query",
            required: true,
            schema: {
              type: "integer",
              minimum: 1,
            },
          },
        ],

        responses: {
          "200": {
            description: "Product list.",
          },
        },
      },
    },

    "/health": {
      get: {
        operationId: "getHealth",

        responses: {
          "200": {
            description: "Healthy.",
          },
        },
      },
    },
  },
};

const BASELINE_SOURCE = JSON.stringify(
  BASELINE_SPECIFICATION
);

const CANDIDATE_SOURCE = JSON.stringify(
  CANDIDATE_SPECIFICATION
);

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
  await DiffReport.deleteMany({});
  await SpecVersion.deleteMany({});
  await Project.deleteMany({});
  await User.deleteMany({});
};

const createAccount = async () => {
  accountCounter += 1;

  const email =
    `diff-report-${accountCounter}@example.com`;

  await User.create({
    email,
    passwordHash: testPasswordHash,
    displayName: "Diff Report Test User",
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

const createProject = async (agent) => {
  const response = await agent
    .post("/api/v1/projects")
    .set("Origin", APP_ORIGIN)
    .send({
      name: "Diff Report Test Project",
      description: "Comparison report integration tests.",
    })
    .expect(201);

  return response.body.data.project;
};

const uploadSpecification = async (
  agent,
  projectId,
  sourceText,
  label,
  filename
) => {
  const response = await agent
    .post(`/api/v1/projects/${projectId}/specifications`)
    .set("Origin", APP_ORIGIN)
    .field("label", label)
    .attach(
      "file",
      Buffer.from(sourceText, "utf8"),
      {
        filename,
      }
    )
    .expect(201);

  return response.body.data.specification;
};

const createVersionPair = async (agent) => {
  const project = await createProject(agent);

  const baseline = await uploadSpecification(
    agent,
    project.id,
    BASELINE_SOURCE,
    "v1",
    "baseline.json"
  );

  const candidate = await uploadSpecification(
    agent,
    project.id,
    CANDIDATE_SOURCE,
    "v2",
    "candidate.json"
  );

  return {
    project,
    baseline,
    candidate,
  };
};

// IMPORTANT: This helper must not be async.
// It returns a Supertest request, which callers chain with .expect().
const createReport = (
  agent,
  projectId,
  baseline,
  candidate
) => {
  return agent
    .post(`/api/v1/projects/${projectId}/diff-reports`)
    .set("Origin", APP_ORIGIN)
    .send({
      baselineSpecVersionId: baseline.id,
      candidateSpecVersionId: candidate.id,
    });
};

beforeAll(async () => {
  if (!MONGODB_TEST_URI) {
    throw new Error(
      "MONGODB_TEST_URI is required for diff report integration tests."
    );
  }

  if (MONGODB_TEST_URI === process.env.MONGODB_URI) {
    throw new Error(
      "Diff report integration tests must use a separate test database connection."
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
      "Diff report integration tests must use the dedicated contractguard_test_user account."
    );
  }

  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is required for diff report integration tests."
    );
  }

  User.schema.set("autoIndex", false);
  Project.schema.set("autoIndex", false);
  SpecVersion.schema.set("autoIndex", false);
  DiffReport.schema.set("autoIndex", false);

  await mongoose.connect(MONGODB_TEST_URI, {
    dbName: TEST_DATABASE_NAME,
    serverSelectionTimeoutMS: 10000,
  });

  databaseConnected = true;

  await User.collection.createIndex(
    { email: 1 },
    {
      unique: true,
      name: "uniq_users_email",
    }
  );

  await Project.collection.createIndex(
    { ownerId: 1, updatedAt: -1 },
    {
      name: "idx_projects_owner_updated_at",
    }
  );

  await Project.collection.createIndex(
    { ownerId: 1, slug: 1 },
    {
      unique: true,
      name: "uniq_projects_owner_slug",
    }
  );

  await SpecVersion.collection.createIndex(
    { projectId: 1, createdAt: -1 },
    {
      name: "idx_specversions_project_created",
    }
  );

  await SpecVersion.collection.createIndex(
    { projectId: 1, contentHash: 1 },
    {
      unique: true,
      name: "uniq_specversions_project_hash",
    }
  );

  await SpecVersion.collection.createIndex(
    { projectId: 1, label: 1 },
    {
      unique: true,
      name: "uniq_specversions_project_label",
    }
  );

  await DiffReport.collection.createIndex(
    { projectId: 1, createdAt: -1 },
    {
      name: "idx_diffreports_project_created",
    }
  );

  await DiffReport.collection.createIndex(
    { projectId: 1, analysisFingerprint: 1 },
    {
      unique: true,
      name: "uniq_diffreports_project_fingerprint",
    }
  );

  testPasswordHash = await hashPassword(TEST_PASSWORD);

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
    try {
      if (databaseReady) {
        await clearTestDatabase();
      }
    } finally {
      await mongoose.disconnect();
      databaseConnected = false;
    }
  }
});

describe("Diff report API integration", () => {
  it("should compare two specification versions and persist breaking changes", async () => {
    const agent = await createAccount();

    const {
      project,
      baseline,
      candidate,
    } = await createVersionPair(agent);

    const response = await createReport(
      agent,
      project.id,
      baseline,
      candidate
    ).expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.reused).toBe(false);

    const report = response.body.data.diffReport;

    expect(report.analysisStatus).toBe("COMPLETE");

    expect(report.summary).toMatchObject({
      breakingChanges: 3,
      addedOperations: 1,
      removedOperations: 1,
    });

    expect(report.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "PARAMETER_REQUIRED",
          severity: "BREAKING",
        }),

        expect.objectContaining({
          changeType: "RESPONSE_REMOVED",
          severity: "BREAKING",
        }),

        expect.objectContaining({
          changeType: "OPERATION_REMOVED",
          severity: "BREAKING",
        }),

        expect.objectContaining({
          changeType: "OPERATION_ADDED",
          severity: "NON_BREAKING",
        }),
      ])
    );

    const stored = await DiffReport.findById(report.id).lean();

    expect(stored).not.toBeNull();
    expect(stored.baselineSpecVersionId.toString()).toBe(
      baseline.id
    );
    expect(stored.candidateSpecVersionId.toString()).toBe(
      candidate.id
    );
  });

  it("should reuse an existing report for the same version pair", async () => {
    const agent = await createAccount();

    const {
      project,
      baseline,
      candidate,
    } = await createVersionPair(agent);

    const first = await createReport(
      agent,
      project.id,
      baseline,
      candidate
    ).expect(201);

    const second = await createReport(
      agent,
      project.id,
      baseline,
      candidate
    ).expect(200);

    expect(first.body.data.diffReport.id).toBe(
      second.body.data.diffReport.id
    );

    expect(second.body.data.reused).toBe(true);

    expect(await DiffReport.countDocuments({})).toBe(1);
  });

  it("should list reports belonging to a project", async () => {
    const agent = await createAccount();

    const {
      project,
      baseline,
      candidate,
    } = await createVersionPair(agent);

    await createReport(
      agent,
      project.id,
      baseline,
      candidate
    ).expect(201);

    const response = await agent
      .get(
        `/api/v1/projects/${project.id}/diff-reports`
      )
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.diffReports).toHaveLength(1);

    expect(response.body.data.diffReports[0]).toMatchObject({
      baselineLabel: "v1",
      candidateLabel: "v2",
      analysisStatus: "COMPLETE",
    });
  });

  it("should retrieve a complete persisted report", async () => {
    const agent = await createAccount();

    const {
      project,
      baseline,
      candidate,
    } = await createVersionPair(agent);

    const created = await createReport(
      agent,
      project.id,
      baseline,
      candidate
    ).expect(201);

    const reportId = created.body.data.diffReport.id;

    const response = await agent
      .get(
        `/api/v1/projects/${project.id}/diff-reports/${reportId}`
      )
      .expect(200);

    expect(response.body.success).toBe(true);

    expect(
      response.body.data.diffReport.id
    ).toBe(reportId);

    expect(
      response.body.data.diffReport.changes.length
    ).toBeGreaterThan(0);
  });

  it("should reject comparing a specification version with itself", async () => {
    const agent = await createAccount();

    const {
      project,
      baseline,
    } = await createVersionPair(agent);

    const response = await agent
      .post(
        `/api/v1/projects/${project.id}/diff-reports`
      )
      .set("Origin", APP_ORIGIN)
      .send({
        baselineSpecVersionId: baseline.id,
        candidateSpecVersionId: baseline.id,
      })
      .expect(400);

    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("should reject versions belonging to another project", async () => {
    const agent = await createAccount();

    const {
      project,
      baseline,
      candidate,
    } = await createVersionPair(agent);

    const otherProject = await createProject(agent);

    const response = await agent
      .post(
        `/api/v1/projects/${otherProject.id}/diff-reports`
      )
      .set("Origin", APP_ORIGIN)
      .send({
        baselineSpecVersionId: baseline.id,
        candidateSpecVersionId: candidate.id,
      })
      .expect(404);

    expect(response.body.error.code).toBe(
      "RESOURCE_NOT_FOUND"
    );

    expect(await DiffReport.countDocuments({})).toBe(0);
  });

  it("should prevent another user from accessing reports", async () => {
    const owner = await createAccount();
    const otherUser = await createAccount();

    const {
      project,
      baseline,
      candidate,
    } = await createVersionPair(owner);

    await createReport(
      owner,
      project.id,
      baseline,
      candidate
    ).expect(201);

    const response = await otherUser
      .get(
        `/api/v1/projects/${project.id}/diff-reports`
      )
      .expect(404);

    expect(response.body.error.code).toBe(
      "RESOURCE_NOT_FOUND"
    );
  });

  it("should reject unauthenticated comparison requests", async () => {
    const projectId =
      new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .get(
        `/api/v1/projects/${projectId}/diff-reports`
      )
      .expect(401);

    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("should enforce the report listing limit", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const response = await agent
      .get(
        `/api/v1/projects/${project.id}/diff-reports`
      )
      .query({
        limit: 51,
      })
      .expect(400);

    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });
});
