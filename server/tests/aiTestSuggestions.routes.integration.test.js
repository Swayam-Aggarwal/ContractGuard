import mongoose from "mongoose";
import request from "supertest";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  readFileSync,
} from "node:fs";

import {
  dirname,
  resolve,
} from "node:path";

import {
  fileURLToPath,
} from "node:url";

import createApp from "../src/app.js";

import User from "../src/models/user.model.js";
import Project from "../src/models/project.model.js";
import SpecVersion from "../src/models/specVersion.model.js";
import DiffReport from "../src/models/diffReport.model.js";
import TestCase from "../src/models/testCase.model.js";

import { hashPassword } from "../src/utils/password.js";

const TEST_DIRECTORY = dirname(
  fileURLToPath(import.meta.url)
);

const PROJECT_ROOT = resolve(
  TEST_DIRECTORY,
  "../.."
);

const BASELINE_SOURCE = readFileSync(
  resolve(PROJECT_ROOT, "examples/demo-store-v1.yaml"),
  "utf8"
);

const CANDIDATE_SOURCE = readFileSync(
  resolve(PROJECT_ROOT, "examples/demo-store-v2.yaml"),
  "utf8"
);

const TEST_DATABASE_NAME = "contractguard_test";
const TEST_DATABASE_USERNAME = "contractguard_test_user";

const APP_ORIGIN =
  process.env.APP_ORIGIN || "http://localhost:5173";

const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI;

const TEST_PASSWORD = "ContractGuard_Test_2026!";

const config = {
  NODE_ENV: "test",
  APP_ORIGIN,
  JWT_SECRET,
  JWT_EXPIRES_IN: "30m",
  GEMINI_API_KEY: "",
  GEMINI_MODEL: "gemini-3.8-flash",
};

const app = createApp(config);

let databaseConnected = false;
let databaseReady = false;
let testPasswordHash;
let testAgent;
let workspace;

const clearTestDatabase = async () => {
  await TestCase.deleteMany({});
  await DiffReport.deleteMany({});
  await SpecVersion.deleteMany({});
  await Project.deleteMany({});
  await User.deleteMany({});
};

const createAccount = async () => {
  const email = "ai-suggestion-test@example.com";

  await User.create({
    email,
    passwordHash: testPasswordHash,
    displayName: "AI Suggestion Test User",
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
      name: "AI Suggestion Integration Project",
      description:
        "Integration test for the optional AI test-suggestion workflow.",
    })
    .expect(201);

  return response.body.data.project;
};

const uploadSpecification = async (
  agent,
  projectId,
  source,
  filename
) => {
  const response = await agent
    .post(
      `/api/v1/projects/${encodeURIComponent(projectId)}/specifications`
    )
    .set("Origin", APP_ORIGIN)
    .attach(
      "file",
      Buffer.from(source, "utf8"),
      filename
    )
    .expect(201);

  return response.body.data.specification;
};

const createWorkspace = async () => {
  testAgent = await createAccount();

  const project = await createProject(testAgent);

  const baseline = await uploadSpecification(
    testAgent,
    project.id,
    BASELINE_SOURCE,
    "demo-store-v1.yaml"
  );

  const candidate = await uploadSpecification(
    testAgent,
    project.id,
    CANDIDATE_SOURCE,
    "demo-store-v2.yaml"
  );

  const comparisonResponse = await testAgent
    .post(
      `/api/v1/projects/${encodeURIComponent(project.id)}/diff-reports`
    )
    .set("Origin", APP_ORIGIN)
    .send({
      baselineVersionId: baseline.id,
      candidateVersionId: candidate.id,
    })
    .expect((response) => {
      if (![200, 201].includes(response.status)) {
        throw new Error(
          `Comparison creation failed: ${JSON.stringify(response.body)}`
        );
      }
    });

  const report =
    comparisonResponse.body.data.diffReport;

  workspace = {
    project,
    baseline,
    candidate,
    report,
  };
};

const suggestionBasePath = () => {
  const {
    project,
    report,
  } = workspace;

  return (
    `/api/v1/projects/${encodeURIComponent(project.id)}` +
    `/diff-reports/${encodeURIComponent(report.id)}` +
    `/ai-test-suggestions`
  );
};

beforeAll(async () => {
  if (!MONGODB_TEST_URI) {
    throw new Error(
      "MONGODB_TEST_URI is required for AI suggestion integration tests."
    );
  }

  if (MONGODB_TEST_URI === process.env.MONGODB_URI) {
    throw new Error(
      "AI suggestion integration tests must use a separate test database."
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
    !["mongodb:", "mongodb+srv:"].includes(
      parsedUri.protocol
    ) ||
    decodeURIComponent(parsedUri.username) !==
      TEST_DATABASE_USERNAME
  ) {
    throw new Error(
      "AI suggestion integration tests must use the dedicated test database account."
    );
  }

  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is required for AI suggestion integration tests."
    );
  }

  User.schema.set("autoIndex", false);
  Project.schema.set("autoIndex", false);
  SpecVersion.schema.set("autoIndex", false);
  DiffReport.schema.set("autoIndex", false);
  TestCase.schema.set("autoIndex", false);

  await mongoose.connect(MONGODB_TEST_URI, {
    dbName: TEST_DATABASE_NAME,
    serverSelectionTimeoutMS: 10_000,
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
    {
      projectId: 1,
      analysisFingerprint: 1,
    },
    {
      unique: true,
      name: "uniq_diffreports_project_fingerprint",
    }
  );

  testPasswordHash = await hashPassword(TEST_PASSWORD);

  await clearTestDatabase();

  databaseReady = true;
});

beforeEach(async () => {
  if (!databaseReady) {
    throw new Error(
      "AI suggestion integration-test database is not ready."
    );
  }

  await createWorkspace();
});

afterEach(async () => {
  if (databaseReady) {
    await clearTestDatabase();
  }

  testAgent = undefined;
  workspace = undefined;
});

afterAll(async () => {
  if (!databaseConnected) {
    return;
  }

  try {
    if (databaseReady) {
      await clearTestDatabase();
    }
  } finally {
    await mongoose.disconnect();
    databaseConnected = false;
  }
});

describe("AI test suggestion routes", () => {
  it("returns the selected synthetic operation preview without contacting Gemini", async () => {
    const response = await testAgent
      .get(
        `${suggestionBasePath()}/preview?operationId=listProducts`
      )
      .set("Origin", APP_ORIGIN)
      .expect(200);

    expect(response.body.success).toBe(true);

    expect(response.body.data.provider).toBe(
      "Google Gemini"
    );

    expect(
      response.body.data.providerConfigured
    ).toBe(false);

    expect(
      response.body.data.selectedOperation
    ).toMatchObject({
      operationId: "listProducts",
      method: "GET",
      path: "/products",
    });

    expect(
      response.body.data.availableOperations
    ).toHaveLength(2);

    expect(
      response.body.data.providerSubmissionPreview.operation
    ).toMatchObject({
      operationId: "listProducts",
      method: "GET",
      path: "/products",
    });

    expect(
      JSON.stringify(
        response.body.data.providerSubmissionPreview
      )
    ).not.toContain("sourceText");

    expect(
      JSON.stringify(
        response.body.data.providerSubmissionPreview
      )
    ).not.toContain("GEMINI_API_KEY");
  });

  it("rejects an unsupported operation identifier in the preview query", async () => {
    const response = await testAgent
      .get(
        `${suggestionBasePath()}/preview?operationId=deleteProduct`
      )
      .set("Origin", APP_ORIGIN)
      .expect(400);

    expect(response.body.success).toBe(false);

    expect(
      response.body.error.code
    ).toBe("VALIDATION_ERROR");
  });

  it("rejects a provider request without explicit consent", async () => {
    const response = await testAgent
      .post(suggestionBasePath())
      .set("Origin", APP_ORIGIN)
      .send({
        operationId: "listProducts",
        consent: false,
      })
      .expect(400);

    expect(response.body.success).toBe(false);

    expect(
      response.body.error.code
    ).toBe("VALIDATION_ERROR");
  });

  it("does not call a provider when the Gemini API key is absent", async () => {
    const response = await testAgent
      .post(suggestionBasePath())
      .set("Origin", APP_ORIGIN)
      .send({
        operationId: "listProducts",
        consent: true,
      })
      .expect(503);

    expect(response.body.success).toBe(false);

    expect(
      response.body.error.code
    ).toBe("AI_NOT_CONFIGURED");
  });

  it("requires authentication for the preview endpoint", async () => {
    const response = await request(app)
      .get(
        `${suggestionBasePath()}/preview?operationId=listProducts`
      )
      .expect(401);

    expect(response.body.success).toBe(false);
  });
});