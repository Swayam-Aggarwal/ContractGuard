import { readFileSync } from "node:fs";

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

const DEMO_JSON_SOURCE = JSON.stringify({
  openapi: "3.0.3",
  info: {
    title: "Demo Store JSON API",
    version: "1.0.0",
  },
  paths: {},
});

const config = {
  NODE_ENV: "test",
  APP_ORIGIN,
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "30m",
};

const app = createApp(config);

let databaseConnected = false;
let databaseReady = false;

let accountCounter = 0;

const clearTestDatabase = async () => {
  await SpecVersion.deleteMany({});
  await Project.deleteMany({});
  await User.deleteMany({});
};

const createAccount = async () => {
  accountCounter += 1;

  const email = `spec-api-user-${accountCounter}@example.com`;
  const passwordHash = await hashPassword(TEST_PASSWORD);

  await User.create({
    email,
    passwordHash,
    displayName: "Specification API Test User",
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

const createProject = async (
  agent,
  name = "Specification API Project"
) => {
  const response = await agent
    .post("/api/v1/projects")
    .set("Origin", APP_ORIGIN)
    .send({
      name,
      description: "Specification API integration test",
    })
    .expect(201);

  return response.body.data.project;
};

const uploadSpecification = (
  agent,
  projectId,
  sourceText = DEMO_V1_SOURCE,
  {
    label,
    filename = "demo-store-v1.yaml",
  } = {}
) => {
  let uploadRequest = agent
    .post(`/api/v1/projects/${projectId}/specifications`)
    .set("Origin", APP_ORIGIN);

  if (label !== undefined) {
    uploadRequest = uploadRequest.field("label", label);
  }

  return uploadRequest.attach(
    "file",
    Buffer.from(sourceText, "utf8"),
    {
      filename,
    }
  );
};

beforeAll(async () => {
  if (!MONGODB_TEST_URI) {
    throw new Error(
      "MONGODB_TEST_URI is required for specification API integration tests."
    );
  }

  if (MONGODB_TEST_URI === process.env.MONGODB_URI) {
    throw new Error(
      "Specification API integration tests must use a separate test database connection."
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
      "Specification API integration tests must use the dedicated test database account."
    );
  }

  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is required for specification API integration tests."
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

describe("Specification API integration", () => {
  it("should reject unauthenticated uploads before processing the file", async () => {
    const projectId = new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .post(`/api/v1/projects/${projectId}/specifications`)
      .set("Origin", APP_ORIGIN)
      .attach("file", Buffer.from("invalid content"), {
        filename: "unsupported.txt",
      })
      .expect(401);

    expect(response.body.error.code).toBe("AUTH_REQUIRED");
    expect(await SpecVersion.countDocuments({})).toBe(0);
  });

  it("should upload and persist a valid YAML specification", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const response = await uploadSpecification(
      agent,
      project.id,
      DEMO_V1_SOURCE,
      {
        label: "  release-1  ",
      }
    ).expect(201);

    const specification = response.body.data.specification;

    expect(response.body.success).toBe(true);

    expect(specification).toMatchObject({
      label: "release-1",
      openapiVersion: "3.0.3",
      title: "Demo Store API",
      sourceFormat: "yaml",
      operationCount: 2,
      parseStatus: "VALID",
    });

    expect(specification.id).toBeDefined();
    expect(specification.createdAt).toBeDefined();

    expect(specification).not.toHaveProperty("sourceText");
    expect(specification).not.toHaveProperty("document");
    expect(specification).not.toHaveProperty("contentHash");
    expect(specification).not.toHaveProperty("uploadedBy");

    const stored = await SpecVersion.findById(
      specification.id
    ).lean();

    expect(stored).not.toBeNull();
    expect(stored.sourceText).toBe(DEMO_V1_SOURCE);
    expect(stored.document.info.title).toBe("Demo Store API");
    expect(stored.projectId.toString()).toBe(project.id);
    expect(stored.uploadedBy).toBeDefined();

    expect(
      await SpecVersion.countDocuments({
        projectId: project.id,
      })
    ).toBe(1);
  });

  it("should accept a JSON specification", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const response = await uploadSpecification(
      agent,
      project.id,
      DEMO_JSON_SOURCE,
      {
        filename: "demo-store.json",
      }
    ).expect(201);

    expect(
      response.body.data.specification
    ).toMatchObject({
      title: "Demo Store JSON API",
      sourceFormat: "json",
      openapiVersion: "3.0.3",
      label: "1.0.0",
      parseStatus: "VALID",
    });
  });

  it("should reject duplicate specification content", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    await uploadSpecification(
      agent,
      project.id
    ).expect(201);

    const response = await uploadSpecification(
      agent,
      project.id,
      DEMO_V1_SOURCE,
      {
        label: "another-label",
      }
    ).expect(409);

    expect(response.body.error.code).toBe(
      "DUPLICATE_RESOURCE"
    );

    expect(
      await SpecVersion.countDocuments({
        projectId: project.id,
      })
    ).toBe(1);
  });

  it("should reject duplicate version labels for different content", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    await uploadSpecification(
      agent,
      project.id,
      DEMO_V1_SOURCE,
      {
        label: "release",
      }
    ).expect(201);

    const response = await uploadSpecification(
      agent,
      project.id,
      DEMO_V2_SOURCE,
      {
        label: "release",
        filename: "demo-store-v2.yaml",
      }
    ).expect(409);

    expect(response.body.error.code).toBe(
      "DUPLICATE_RESOURCE"
    );

    expect(
      await SpecVersion.countDocuments({
        projectId: project.id,
      })
    ).toBe(1);
  });

  it("should list versions newest first without exposing stored source", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    await uploadSpecification(
      agent,
      project.id,
      DEMO_V1_SOURCE
    ).expect(201);

    await uploadSpecification(
      agent,
      project.id,
      DEMO_V2_SOURCE,
      {
        filename: "demo-store-v2.yaml",
      }
    ).expect(201);

    const response = await agent
      .get(`/api/v1/projects/${project.id}/specifications`)
      .expect(200);

    expect(response.body.success).toBe(true);

    const specifications =
      response.body.data.specifications;

    expect(specifications).toHaveLength(2);

    expect(
      specifications.map((item) => item.label)
    ).toEqual(["2.0.0", "1.0.0"]);

    for (const specification of specifications) {
      expect(specification).not.toHaveProperty("sourceText");
      expect(specification).not.toHaveProperty("document");
      expect(specification).not.toHaveProperty("contentHash");
      expect(specification).not.toHaveProperty("uploadedBy");
    }
  });

  it("should retrieve a version with its parsed document but not its original source text", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const upload = await uploadSpecification(
      agent,
      project.id
    ).expect(201);

    const versionId =
      upload.body.data.specification.id;

    const response = await agent
      .get(`/api/v1/specifications/${versionId}`)
      .expect(200);

    const specification =
      response.body.data.specification;

    expect(specification.id).toBe(versionId);
    expect(specification.projectId).toBe(project.id);
    expect(specification.document.info.title).toBe(
      "Demo Store API"
    );

    expect(specification).not.toHaveProperty("sourceText");
    expect(specification).not.toHaveProperty("contentHash");
    expect(specification).not.toHaveProperty("uploadedBy");
  });

  it("should reject uploads and version listing for another user's project", async () => {
    const owner = await createAccount();
    const otherUser = await createAccount();

    const project = await createProject(owner);

    const response = await uploadSpecification(
      otherUser,
      project.id,
      "not valid: ["
    ).expect(404);

    expect(response.body.error.code).toBe(
      "RESOURCE_NOT_FOUND"
    );

    await otherUser
      .get(`/api/v1/projects/${project.id}/specifications`)
      .expect(404);

    expect(await SpecVersion.countDocuments({})).toBe(0);
  });

  it("should prevent another user from retrieving a specification version", async () => {
    const owner = await createAccount();
    const otherUser = await createAccount();

    const project = await createProject(owner);

    const upload = await uploadSpecification(
      owner,
      project.id
    ).expect(201);

    const versionId =
      upload.body.data.specification.id;

    const response = await otherUser
      .get(`/api/v1/specifications/${versionId}`)
      .expect(404);

    expect(response.body.error.code).toBe(
      "RESOURCE_NOT_FOUND"
    );
  });

  it("should reject an invalid OpenAPI document without persisting it", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const response = await uploadSpecification(
      agent,
      project.id,
      "not valid: ["
    ).expect(400);

    expect(response.body.error.code).toBe("SPEC_INVALID");

    expect(
      await SpecVersion.countDocuments({})
    ).toBe(0);
  });

  it("should reject an upload without a file", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const response = await agent
      .post(`/api/v1/projects/${project.id}/specifications`)
      .set("Origin", APP_ORIGIN)
      .field("label", "release")
      .expect(400);

    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("should reject unsupported file extensions", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const response = await uploadSpecification(
      agent,
      project.id,
      "{}",
      {
        filename: "specification.txt",
      }
    ).expect(415);

    expect(response.body.error.code).toBe(
      "UNSUPPORTED_MEDIA_TYPE"
    );
  });

  it("should reject files larger than 1 MiB", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const oversizedBuffer = Buffer.alloc(
      1024 * 1024 + 1,
      65
    );

    const response = await agent
      .post(`/api/v1/projects/${project.id}/specifications`)
      .set("Origin", APP_ORIGIN)
      .attach("file", oversizedBuffer, {
        filename: "oversized.json",
      })
      .expect(413);

    expect(response.body.error.code).toBe(
      "SPEC_LIMIT_EXCEEDED"
    );

    expect(await SpecVersion.countDocuments({})).toBe(0);
  });

  it("should reject an invalid version label", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const response = await uploadSpecification(
      agent,
      project.id,
      DEMO_V1_SOURCE,
      {
        label: "   ",
      }
    ).expect(400);

    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );

    expect(await SpecVersion.countDocuments({})).toBe(0);
  });

  it("should reject an invalid project ID before processing the file", async () => {
    const agent = await createAccount();

    const response = await uploadSpecification(
      agent,
      "invalid-project-id",
      "not valid: ["
    ).expect(400);

    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );

    expect(await SpecVersion.countDocuments({})).toBe(0);
  });

  it("should list extracted operations and schema navigation metadata", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const upload = await uploadSpecification(
      agent,
      project.id
    ).expect(201);

    const specVersionId = upload.body.data.specification.id;

    const response = await agent
      .get(`/api/v1/specifications/${specVersionId}/operations`)
      .expect(200);

    expect(response.body.success).toBe(true);

    const { specification, operations, schemas } =
      response.body.data;

    expect(specification.id).toBe(specVersionId);
    expect(operations).toHaveLength(2);

    const listProducts = operations.find(
      (operation) => operation.operationId === "listProducts"
    );

    expect(listProducts).toMatchObject({
      method: "GET",
      path: "/products",
      summary: "List products",
      parameterCount: 1,
      hasRequestBody: false,
      responseCodes: ["200"],
    });

    expect(listProducts.operationKey).toMatch(
      /^op_[A-Za-z0-9_-]{43}$/
    );

    const getProduct = operations.find(
      (operation) => operation.operationId === "getProduct"
    );

    expect(getProduct).toMatchObject({
      method: "GET",
      path: "/products/{productId}",
      parameterCount: 1,
      hasRequestBody: false,
      responseCodes: ["200", "404"],
    });

    expect(
      schemas.map((schema) => schema.name)
    ).toEqual(["Error", "Product"]);

    const productSchema = schemas.find(
      (schema) => schema.name === "Product"
    );

    expect(productSchema).toMatchObject({
      name: "Product",
      type: "object",
      propertyNames: [
        "currency",
        "description",
        "id",
        "name",
        "price",
        "stock",
      ],
    });
  });

  it("should retrieve operation details including parameters and responses", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const upload = await uploadSpecification(
      agent,
      project.id
    ).expect(201);

    const specVersionId = upload.body.data.specification.id;

    const listing = await agent
      .get(`/api/v1/specifications/${specVersionId}/operations`)
      .expect(200);

    const getProduct = listing.body.data.operations.find(
      (operation) => operation.operationId === "getProduct"
    );

    const response = await agent
      .get(
        `/api/v1/specifications/${specVersionId}/operations/${encodeURIComponent(getProduct.operationKey)}`
      )
      .expect(200);

    expect(response.body.success).toBe(true);

    const { specification, operation, schemas } =
      response.body.data;

    expect(specification.id).toBe(specVersionId);

    expect(operation).toMatchObject({
      operationKey: getProduct.operationKey,
      method: "GET",
      path: "/products/{productId}",
      operationId: "getProduct",
      summary: "Get a product by identifier",
      requestBody: null,
      responseCodes: ["200", "404"],
    });

    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "productId",
          in: "path",
          required: true,
        }),
      ])
    );

    expect(
      operation.responses["200"]
        .content["application/json"].schema.$ref
    ).toBe("#/components/schemas/Product");

    expect(
      operation.responses["404"]
        .content["application/json"].schema.$ref
    ).toBe("#/components/schemas/Error");

    expect(
      schemas.map((schema) => schema.name)
    ).toEqual(["Error", "Product"]);
  });

  it("should reject an unknown but correctly formatted operation key", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const upload = await uploadSpecification(
      agent,
      project.id
    ).expect(201);

    const specVersionId = upload.body.data.specification.id;
    const unknownOperationKey = `op_${"A".repeat(43)}`;

    const response = await agent
      .get(
        `/api/v1/specifications/${specVersionId}/operations/${unknownOperationKey}`
      )
      .expect(404);

    expect(response.body.error.code).toBe(
      "RESOURCE_NOT_FOUND"
    );
  });

  it("should reject a malformed operation key", async () => {
    const agent = await createAccount();

    const specVersionId = new mongoose.Types.ObjectId().toString();

    const response = await agent
      .get(
        `/api/v1/specifications/${specVersionId}/operations/invalid-key`
      )
      .expect(400);

    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("should enforce ownership when listing and retrieving operations", async () => {
    const owner = await createAccount();
    const otherUser = await createAccount();

    const project = await createProject(owner);

    const upload = await uploadSpecification(
      owner,
      project.id
    ).expect(201);

    const specVersionId = upload.body.data.specification.id;

    const listing = await owner
      .get(`/api/v1/specifications/${specVersionId}/operations`)
      .expect(200);

    const operationKey =
      listing.body.data.operations[0].operationKey;

    const listResponse = await otherUser
      .get(`/api/v1/specifications/${specVersionId}/operations`)
      .expect(404);

    expect(listResponse.body.error.code).toBe(
      "RESOURCE_NOT_FOUND"
    );

    const detailResponse = await otherUser
      .get(
        `/api/v1/specifications/${specVersionId}/operations/${operationKey}`
      )
      .expect(404);

    expect(detailResponse.body.error.code).toBe(
      "RESOURCE_NOT_FOUND"
    );
  });

  it("should reject unauthenticated operation requests", async () => {
    const specVersionId = new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .get(`/api/v1/specifications/${specVersionId}/operations`)
      .expect(401);

    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("should preserve parser warnings through upload, listing and detail retrieval", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const recursiveDocument = {
      openapi: "3.0.3",
      info: {
        title: "Recursive API",
        version: "1.0.0",
      },
      paths: {
        "/nodes": {
          get: {
            responses: {
              "200": {
                description: "A node.",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/Node",
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: {
              child: {
                $ref: "#/components/schemas/Node",
              },
            },
          },
        },
      },
    };

    const upload = await uploadSpecification(
      agent,
      project.id,
      JSON.stringify(recursiveDocument),
      {
        filename: "recursive.json",
      }
    ).expect(201);

    const specification = upload.body.data.specification;

    expect(specification.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "document",
          message: expect.stringContaining(
            "Circular internal references"
          ),
        }),
      ])
    );

    const versionId = specification.id;

    const listing = await agent
      .get(`/api/v1/projects/${project.id}/specifications`)
      .expect(200);

    const listedVersion = listing.body.data.specifications.find(
      (item) => item.id === versionId
    );

    expect(listedVersion.warnings).toEqual(
      specification.warnings
    );

    const detail = await agent
      .get(`/api/v1/specifications/${versionId}`)
      .expect(200);

    expect(
      detail.body.data.specification.warnings
    ).toEqual(specification.warnings);

    expect(
      detail.body.data.specification
    ).not.toHaveProperty("sourceText");
  });

  it("should reject an invalid specification version ID", async () => {
    const agent = await createAccount();

    const response = await agent
      .get("/api/v1/specifications/not-a-valid-id")
      .expect(400);

    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });
});