import { readFileSync } from "node:fs";

import mongoose from "mongoose";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import User from "../src/models/user.model.js";
import Project from "../src/models/project.model.js";
import SpecVersion from "../src/models/specVersion.model.js";

import { hashPassword } from "../src/utils/password.js";

import specVersionService from "../src/services/specVersion.service.js";

const TEST_DATABASE_NAME = "contractguard_test";
const TEST_DATABASE_USERNAME = "contractguard_test_user";

const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI;

const DEMO_V1_SOURCE = readFileSync(
  new URL("../../examples/demo-store-v1.yaml", import.meta.url),
  "utf8"
);

const DEMO_V2_SOURCE = readFileSync(
  new URL("../../examples/demo-store-v2.yaml", import.meta.url),
  "utf8"
);

const TEST_PASSWORD = "ContractGuard_Test_2026!";

let databaseConnected = false;
let databaseReady = false;
let testPasswordHash;

let userCounter = 0;
let projectCounter = 0;

const clearTestDatabase = async () => {
  await SpecVersion.deleteMany({});
  await Project.deleteMany({});
  await User.deleteMany({});
};

const createOwner = async () => {
  userCounter += 1;

  return User.create({
    email: `spec-owner-${userCounter}@example.com`,
    passwordHash: testPasswordHash,
    displayName: "Specification Test User",
  });
};

const createProject = async (ownerId) => {
  projectCounter += 1;

  return Project.create({
    ownerId,
    name: `Specification Project ${projectCounter}`,
    slug: `specification-project-${projectCounter}`,
    description: "Specification integration test",
  });
};

const uploadSpecification = (
  ownerId,
  projectId,
  options = {}
) => {
  return specVersionService.createSpecificationVersion(
    ownerId.toString(),
    projectId.toString(),
    {
      sourceText: options.sourceText ?? DEMO_V1_SOURCE,
      sourceFormat: options.sourceFormat ?? "yaml",
      ...(options.label !== undefined
        ? { label: options.label }
        : {}),
    }
  );
};

beforeAll(async () => {
  if (!MONGODB_TEST_URI) {
    throw new Error(
      "MONGODB_TEST_URI is required for specification integration tests."
    );
  }

  if (MONGODB_TEST_URI === process.env.MONGODB_URI) {
    throw new Error(
      "Specification integration tests must use a separate test database connection."
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
      "Specification integration tests must use the dedicated contractguard_test_user account."
    );
  }

  User.schema.set("autoIndex", false);
  Project.schema.set("autoIndex", false);
  SpecVersion.schema.set("autoIndex", false);

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

describe("Specification version persistence integration", () => {
  it("should parse and persist a valid specification", async () => {
    const owner = await createOwner();
    const project = await createProject(owner._id);

    const summary = await uploadSpecification(
      owner._id,
      project._id
    );

    expect(summary).toMatchObject({
      label: "1.0.0",
      openapiVersion: "3.0.3",
      title: "Demo Store API",
      sourceFormat: "yaml",
      operationCount: 2,
      parseStatus: "VALID",
    });

    expect(summary.id).toBeDefined();
    expect(summary.createdAt).toBeInstanceOf(Date);
    expect(summary.warnings).toBeInstanceOf(Array);

    expect(summary).not.toHaveProperty("sourceText");
    expect(summary).not.toHaveProperty("document");
    expect(summary).not.toHaveProperty("contentHash");

    const storedVersion = await SpecVersion.findById(
      summary.id
    ).lean();

    expect(storedVersion).not.toBeNull();
    expect(storedVersion.sourceText).toBe(DEMO_V1_SOURCE);
    expect(storedVersion.document.info.title).toBe(
      "Demo Store API"
    );
    expect(storedVersion.projectId.toString()).toBe(
      project._id.toString()
    );
    expect(storedVersion.uploadedBy.toString()).toBe(
      owner._id.toString()
    );
    expect(storedVersion.contentHash).toMatch(
      /^[a-f0-9]{64}$/u
    );

    expect(
      await SpecVersion.countDocuments({
        projectId: project._id,
      })
    ).toBe(1);
  });

  it("should list versions newest first", async () => {
    const owner = await createOwner();
    const project = await createProject(owner._id);

    const first = await uploadSpecification(
      owner._id,
      project._id
    );

    const second = await uploadSpecification(
      owner._id,
      project._id,
      {
        sourceText: DEMO_V2_SOURCE,
      }
    );

    const versions =
      await specVersionService.listSpecificationVersions(
        owner._id.toString(),
        project._id.toString()
      );

    expect(versions).toHaveLength(2);

    expect(versions[0].id).toBe(second.id);
    expect(versions[1].id).toBe(first.id);

    expect(versions[0].label).toBe("2.0.0");
    expect(versions[1].label).toBe("1.0.0");

    expect(versions[0]).not.toHaveProperty("sourceText");
    expect(versions[0]).not.toHaveProperty("document");
  });

  it("should reject identical specification content in the same project", async () => {
    const owner = await createOwner();
    const project = await createProject(owner._id);

    await uploadSpecification(
      owner._id,
      project._id
    );

    await expect(
      uploadSpecification(
        owner._id,
        project._id,
        {
          label: "duplicate-content",
        }
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "DUPLICATE_RESOURCE",
    });

    expect(
      await SpecVersion.countDocuments({
        projectId: project._id,
      })
    ).toBe(1);
  });

  it("should reject duplicate version labels for different content", async () => {
    const owner = await createOwner();
    const project = await createProject(owner._id);

    await uploadSpecification(
      owner._id,
      project._id,
      {
        label: "release",
      }
    );

    await expect(
      uploadSpecification(
        owner._id,
        project._id,
        {
          sourceText: DEMO_V2_SOURCE,
          label: "release",
        }
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "DUPLICATE_RESOURCE",
    });

    expect(
      await SpecVersion.countDocuments({
        projectId: project._id,
      })
    ).toBe(1);
  });

  it("should allow the same specification in a different project", async () => {
    const owner = await createOwner();

    const firstProject = await createProject(owner._id);
    const secondProject = await createProject(owner._id);

    const first = await uploadSpecification(
      owner._id,
      firstProject._id
    );

    const second = await uploadSpecification(
      owner._id,
      secondProject._id
    );

    expect(first.id).not.toBe(second.id);

    expect(
      await SpecVersion.countDocuments({})
    ).toBe(2);
  });

  it("should prevent access to another user's project", async () => {
    const owner = await createOwner();
    const otherUser = await createOwner();

    const project = await createProject(owner._id);

    await expect(
      uploadSpecification(
        otherUser._id,
        project._id
      )
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });

    expect(
      await SpecVersion.countDocuments({})
    ).toBe(0);
  });

  it("should verify project ownership before parsing the uploaded document", async () => {
    const owner = await createOwner();
    const otherUser = await createOwner();
    const project = await createProject(owner._id);

    await expect(
      specVersionService.createSpecificationVersion(
        otherUser._id.toString(),
        project._id.toString(),
        {
          sourceText: "not valid: [",
          sourceFormat: "yaml",
        }
      )
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });

    expect(
      await SpecVersion.countDocuments({})
    ).toBe(0);
  });
  it("should reject a project that does not exist", async () => {
    const owner = await createOwner();
    const missingProjectId =
      new mongoose.Types.ObjectId();

    await expect(
      uploadSpecification(
        owner._id,
        missingProjectId
      )
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("should reject invalid owner and project IDs", async () => {
    await expect(
      specVersionService.createSpecificationVersion(
        "invalid-owner-id",
        new mongoose.Types.ObjectId().toString(),
        {
          sourceText: DEMO_V1_SOURCE,
          sourceFormat: "yaml",
        }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });

    await expect(
      specVersionService.createSpecificationVersion(
        new mongoose.Types.ObjectId().toString(),
        "invalid-project-id",
        {
          sourceText: DEMO_V1_SOURCE,
          sourceFormat: "yaml",
        }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should reject an invalid specification without saving it", async () => {
    const owner = await createOwner();
    const project = await createProject(owner._id);

    await expect(
      uploadSpecification(
        owner._id,
        project._id,
        {
          sourceText: "not valid: [",
        }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "SPEC_INVALID",
    });

    expect(
      await SpecVersion.countDocuments({})
    ).toBe(0);
  });

  it("should reject invalid version labels", async () => {
    const owner = await createOwner();
    const project = await createProject(owner._id);

    await expect(
      uploadSpecification(
        owner._id,
        project._id,
        {
          label: "   ",
        }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });

    await expect(
      uploadSpecification(
        owner._id,
        project._id,
        {
          label: "v".repeat(81),
        }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });

    expect(
      await SpecVersion.countDocuments({})
    ).toBe(0);
  });

  it("should return complete version data only to its owning user", async () => {
    const owner = await createOwner();
    const otherUser = await createOwner();

    const project = await createProject(owner._id);

    const summary = await uploadSpecification(
      owner._id,
      project._id
    );

    const record =
      await specVersionService.getSpecificationVersionRecord(
        owner._id.toString(),
        summary.id
      );

    expect(record.sourceText).toBe(DEMO_V1_SOURCE);
    expect(record.document.info.title).toBe(
      "Demo Store API"
    );

    await expect(
      specVersionService.getSpecificationVersionRecord(
        otherUser._id.toString(),
        summary.id
      )
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("should reject listing versions for another user's project", async () => {
    const owner = await createOwner();
    const otherUser = await createOwner();

    const project = await createProject(owner._id);

    await expect(
      specVersionService.listSpecificationVersions(
        otherUser._id.toString(),
        project._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });
  });
});
