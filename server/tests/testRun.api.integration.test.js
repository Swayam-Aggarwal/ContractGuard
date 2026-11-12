import { readFileSync } from "node:fs";

import mongoose from "mongoose";
import request from "supertest";

import {
  afterAll,
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
import TestCase from "../src/models/testCase.model.js";
import TestRun from "../src/models/testRun.model.js";

import { hashPassword } from "../src/utils/password.js";

const TEST_DATABASE_NAME = "contractguard_test";
const TEST_DATABASE_USERNAME = "contractguard_test_user";

const APP_ORIGIN =
  process.env.APP_ORIGIN || "http://localhost:5173";

const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI;

const TEST_PASSWORD = "ContractGuard_Test_2026!";

const DEMO_V1_SOURCE = readFileSync(
  new URL("../../examples/demo-store-v1.yaml", import.meta.url),
  "utf8"
);

const DEMO_V2_SOURCE = readFileSync(
  new URL("../../examples/demo-store-v2.yaml", import.meta.url),
  "utf8"
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

let sharedAgent;
let sharedWorkspace;

const clearTestDatabase = async () => {
  await TestRun.deleteMany({});
  await TestCase.deleteMany({});
  await DiffReport.deleteMany({});
  await SpecVersion.deleteMany({});
  await Project.deleteMany({});
  await User.deleteMany({});
};

const createAccount = async () => {
  accountCounter += 1;

  const email =
    `test-run-user-${accountCounter}@example.com`;

  await User.create({
    email,
    passwordHash: testPasswordHash,
    displayName: "Test Run Integration User",
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
      name: "Regression Runner Integration Project",
      description:
        "Exercises bounded Phase 7 test-run execution.",
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
    .post(
      `/api/v1/projects/${projectId}/specifications`
    )
    .set("Origin", APP_ORIGIN)
    .field("label", label)
    .attach(
      "file",
      Buffer.from(sourceText, "utf8"),
      { filename }
    )
    .expect(201);

  return response.body.data.specification;
};

const createWorkspace = async (agent) => {
  const project = await createProject(agent);

  const baseline = await uploadSpecification(
    agent,
    project.id,
    DEMO_V1_SOURCE,
    "1.0.0",
    "demo-store-v1.yaml"
  );

  const candidate = await uploadSpecification(
    agent,
    project.id,
    DEMO_V2_SOURCE,
    "2.0.0",
    "demo-store-v2.yaml"
  );

  const reportResponse = await agent
    .post(
      `/api/v1/projects/${project.id}/diff-reports`
    )
    .set("Origin", APP_ORIGIN)
    .send({
      baselineVersionId: baseline.id,
      candidateVersionId: candidate.id,
    })
    .expect(201);

  const report = reportResponse.body.data.diffReport;

  const operationsResponse = await agent
    .get(
      `/api/v1/specifications/${baseline.id}/operations`
    )
    .expect(200);

  return {
    project,
    baseline,
    candidate,
    report,
    operations: operationsResponse.body.data.operations,
  };
};

const createAndApproveCase = async (
  agent,
  baselineVersionId,
  operation,
  input
) => {
  const endpoint =
    `/api/v1/specifications/${baselineVersionId}/test-cases`;

  const created = await agent
    .post(endpoint)
    .set("Origin", APP_ORIGIN)
    .send({
      operationKey: operation.operationKey,
      operationPath: operation.path,
      title: input.title,
      description:
        input.description ??
        "Phase 7 integration test case.",
      request: input.request,
      assertions: input.assertions,
    })
    .expect(201);

  const testCase = created.body.data.testCase;

  const approved = await agent
    .post(
      `/api/v1/test-cases/${testCase.id}/approve`
    )
    .set("Origin", APP_ORIGIN)
    .expect(200);

  return approved.body.data.testCase;
};

const createDraftCase = async (
  agent,
  baselineVersionId,
  operation
) => {
  const response = await agent
    .post(
      `/api/v1/specifications/${baselineVersionId}/test-cases`
    )
    .set("Origin", APP_ORIGIN)
    .send({
      operationKey: operation.operationKey,
      operationPath: operation.path,
      title: "Draft list products case",
      description:
        "Must not execute before approval.",
      request: {
        pathParams: {},
        queryParams: {},
      },
      assertions: {
        expectedStatus: 200,
        propertyAssertions: [],
        requiredProperties: ["items"],
      },
    })
    .expect(201);

  return response.body.data.testCase;
};

const waitForTerminalRun = async (
  agent,
  projectId,
  reportId,
  testRunId
) => {
  const endpoint =
    `/api/v1/projects/${projectId}` +
    `/diff-reports/${reportId}` +
    `/test-runs/${testRunId}`;

  const deadline = Date.now() + 30000;

  let latest;

  while (Date.now() < deadline) {
    const response = await agent
      .get(endpoint)
      .expect(200);

    latest = response.body.data.testRun;

    if (
      !["QUEUED", "RUNNING"].includes(latest.status)
    ) {
      return latest;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 150)
    );
  }

  throw new Error(
    "Test run did not reach a terminal status within 30 seconds. " +
      `Last status: ${latest?.status ?? "unknown"}.`
  );
};

beforeAll(
  async () => {
    if (!MONGODB_TEST_URI) {
      throw new Error(
        "MONGODB_TEST_URI is required for test-run API integration tests."
      );
    }

    if (
      MONGODB_TEST_URI === process.env.MONGODB_URI
    ) {
      throw new Error(
        "Test-run API integration tests must use a separate test database."
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
      !["mongodb+srv:", "mongodb:"].includes(
        parsedUri.protocol
      ) ||
      decodeURIComponent(parsedUri.username) !==
        TEST_DATABASE_USERNAME
    ) {
      throw new Error(
        "Test-run API integration tests must use the dedicated test database account."
      );
    }

    if (!JWT_SECRET) {
      throw new Error(
        "JWT_SECRET is required for test-run API integration tests."
      );
    }

    for (const model of [
      User,
      Project,
      SpecVersion,
      DiffReport,
      TestCase,
      TestRun,
    ]) {
      model.schema.set("autoIndex", false);
    }

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

    await TestRun.collection.createIndex(
      {
        projectId: 1,
        comparisonId: 1,
        createdAt: -1,
      },
      {
        name: "idx_testruns_project_comparison_created",
      }
    );

    await TestRun.collection.createIndex(
      { status: 1, createdAt: 1 },
      {
        name: "idx_testruns_status_created",
      }
    );

    await TestRun.collection.createIndex(
      {
        ownerId: 1,
        projectId: 1,
        createdAt: -1,
      },
      {
        name: "idx_testruns_owner_project_created",
      }
    );

    testPasswordHash = await hashPassword(
      TEST_PASSWORD
    );

    await clearTestDatabase();

    databaseReady = true;

    // Build one trusted workspace for both integration tests.
    // This avoids uploading the same two specifications and
    // generating the same comparison twice.
    sharedAgent = await createAccount();
    sharedWorkspace = await createWorkspace(
      sharedAgent
    );
  },
  60000
);

afterAll(
  async () => {
    if (!databaseConnected) return;

    try {
      if (databaseReady) {
        await clearTestDatabase();
      }
    } finally {
      await mongoose.disconnect();
      databaseConnected = false;
      databaseReady = false;
    }
  },
  30000
);

describe("Regression test-run API integration", () => {
  it(
    "executes approved baseline cases against trusted V2 and persists baseline regressions",
    async () => {
      const {
        project,
        baseline,
        report,
        operations,
      } = sharedWorkspace;

      const listOperation = operations.find(
        (entry) =>
          entry.kind === "path" &&
          entry.method === "GET" &&
          entry.path === "/products"
      );

      const productOperation = operations.find(
        (entry) =>
          entry.kind === "path" &&
          entry.method === "GET" &&
          entry.path === "/products/{productId}"
      );

      expect(listOperation).toBeDefined();
      expect(productOperation).toBeDefined();

      const endpoint =
        `/api/v1/projects/${project.id}` +
        `/diff-reports/${report.id}/test-runs`;

      const eligibilityResponse = await sharedAgent
        .get(endpoint)
        .expect(200);

      expect(
        eligibilityResponse.body.data.executionEligibility
      ).toMatchObject({
        eligible: true,
        baselineFixture: "DEMO_STORE_V1",
        candidateFixture: "DEMO_STORE_V2",
      });

      expect(
        eligibilityResponse.body.data.executionEligibility
          .supportedOperations
      ).toHaveLength(2);

      const listCase = await createAndApproveCase(
        sharedAgent,
        baseline.id,
        listOperation,
        {
          title: "List all products",
          request: {
            pathParams: {},
            queryParams: { limit: "2" },
          },
          assertions: {
            expectedStatus: 200,
            propertyAssertions: [],
            requiredProperties: ["items"],
          },
        }
      );

      const productCase = await createAndApproveCase(
        sharedAgent,
        baseline.id,
        productOperation,
        {
          title: "Retrieve an existing product",
          request: {
            pathParams: { productId: "1001" },
            queryParams: {},
          },
          assertions: {
            expectedStatus: 200,
            propertyAssertions: [],
            requiredProperties: [
              "id",
              "name",
              "price",
            ],
          },
        }
      );

      const invalidTarget = await sharedAgent
        .post(endpoint)
        .set("Origin", APP_ORIGIN)
        .send({
          testCaseIds: [listCase.id],
          targetUrl: "http://127.0.0.1:5000/unsafe",
        })
        .expect(400);

      expect(invalidTarget.body.error.code).toBe(
        "VALIDATION_ERROR"
      );

      const queuedResponse = await sharedAgent
        .post(endpoint)
        .set("Origin", APP_ORIGIN)
        .send({
          testCaseIds: [
            listCase.id,
            productCase.id,
          ],
        })
        .expect(202);

      const queuedRun =
        queuedResponse.body.data.testRun;

      expect(queuedRun.status).toBe("QUEUED");
      expect(
        queuedRun.selectedTestCaseIds
      ).toHaveLength(2);

      const completedRun = await waitForTerminalRun(
        sharedAgent,
        project.id,
        report.id,
        queuedRun.id
      );

      expect(completedRun.status).toBe("FAILED");

      expect(completedRun.summary).toMatchObject({
        total: 2,
        passed: 0,
        failed: 2,
        skipped: 0,
        unsupported: 0,
        errors: 0,
      });

      expect(completedRun.results).toHaveLength(2);

      for (const result of completedRun.results) {
        expect(result.status).toBe("FAILED");

        expect(
          result.candidateSchemaValidation
        ).toMatchObject({
          status: "READY",
          valid: true,
        });

        expect(
          result.baselineSchemaValidation
        ).toMatchObject({
          status: "READY",
          valid: false,
        });

        expect(
          result.assertions.length
        ).toBeGreaterThan(0);

        expect(
          result.assertions.every(
            (entry) => entry.passed
          )
        ).toBe(true);
      }

      const stored = await TestRun.findById(
        queuedRun.id
      )
        .lean()
        .exec();

      expect(stored).not.toBeNull();
      expect(stored.testCaseSnapshots).toHaveLength(2);
      expect(stored.results).toHaveLength(2);

      expect(
        stored.baselineVersionId.toString()
      ).toBe(baseline.id);

      expect(
        stored.summary.errorCount
      ).toBe(0);

      const history = await sharedAgent
        .get(endpoint)
        .expect(200);

      expect(
        history.body.data.testRuns
      ).toHaveLength(1);

      expect(
        history.body.data.testRuns[0].id
      ).toBe(queuedRun.id);

      const otherAgent = await createAccount();

      await otherAgent
        .get(`${endpoint}/${queuedRun.id}`)
        .expect(404);
    },
    45000
  );

  it(
    "rejects draft cases even when the comparison itself is eligible",
    async () => {
      const {
        project,
        baseline,
        report,
        operations,
      } = sharedWorkspace;

      const listOperation = operations.find(
        (entry) =>
          entry.kind === "path" &&
          entry.method === "GET" &&
          entry.path === "/products"
      );

      expect(listOperation).toBeDefined();

      const draftCase = await createDraftCase(
        sharedAgent,
        baseline.id,
        listOperation
      );

      expect(draftCase.status).toBe("DRAFT");

      const endpoint =
        `/api/v1/projects/${project.id}` +
        `/diff-reports/${report.id}/test-runs`;

      const runCountBefore =
        await TestRun.countDocuments({
          comparisonId: report.id,
        });

      const response = await sharedAgent
        .post(endpoint)
        .set("Origin", APP_ORIGIN)
        .send({
          testCaseIds: [draftCase.id],
        })
        .expect(409);

      expect(response.body.error.code).toBe(
        "TEST_RUN_TEST_CASE_INELIGIBLE"
      );

      const runCountAfter =
        await TestRun.countDocuments({
          comparisonId: report.id,
        });

      expect(runCountAfter).toBe(runCountBefore);
    },
    30000
  );
});