
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

const EXPLORER_SPECIFICATION = {
  openapi: "3.2.1",

  info: {
    title: "ContractGuard Explorer Integration API",
    version: "1.0.0",
  },

  paths: {
    "/products": {
      get: {
        operationId: "listProducts",
        summary: "List products",

        parameters: [
          {
            $ref: "#/components/parameters/Limit",
          },
        ],

        responses: {
          "200": {
            $ref: "#/components/responses/ProductList",
          },
        },
      },

      query: {
        operationId: "queryProducts",
        summary: "Query products",

        responses: {
          "200": {
            description: "Query results.",
          },
        },
      },

      additionalOperations: {
        SEARCH: {
          operationId: "searchProducts",
          summary: "Search products",

          responses: {
            "200": {
              description: "Search results.",
            },
          },
        },
      },
    },

    "/shared": {
      $ref: "#/components/pathItems/Shared",
    },
  },

  components: {
    schemas: {
      Product: {
        type: "object",

        required: ["id", "name"],

        properties: {
          id: {
            type: "string",
          },
          name: {
            type: "string",
          },
          price: {
            type: "number",
            minimum: 0,
          },
        },
      },
    },

    parameters: {
      Limit: {
        name: "limit",
        in: "query",
        description: "Maximum number of products.",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
        },
      },
    },

    responses: {
      ProductList: {
        description: "Product list.",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Product",
              },
            },
          },
        },
      },
    },

    pathItems: {
      Shared: {
        post: {
          operationId: "createSharedResource",
          summary: "Create a shared resource",

          responses: {
            "201": {
              description: "Resource created.",
            },
          },
        },
      },
    },
  },
};

const EXPLORER_SPEC_SOURCE = JSON.stringify(
  EXPLORER_SPECIFICATION
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
  await SpecVersion.deleteMany({});
  await Project.deleteMany({});
  await User.deleteMany({});
};

const createAccount = async () => {
  accountCounter += 1;

  const email =
    `explorer-api-${accountCounter}@example.com`;

  await User.create({
    email,
    passwordHash: testPasswordHash,
    displayName: "Explorer API Test User",
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
      name: "Explorer API Test Project",
      description: "Testing Explorer API endpoints.",
    })
    .expect(201);

  return response.body.data.project;
};

const uploadSpecification = async (agent, projectId) => {
  const response = await agent
    .post(`/api/v1/projects/${projectId}/specifications`)
    .set("Origin", APP_ORIGIN)
    .attach(
      "file",
      Buffer.from(EXPLORER_SPEC_SOURCE, "utf8"),
      {
        filename: "explorer-api-test.json",
      }
    )
    .expect(201);

  return response.body.data.specification;
};

beforeAll(async () => {
  if (!MONGODB_TEST_URI) {
    throw new Error(
      "MONGODB_TEST_URI is required for Explorer API integration tests."
    );
  }

  if (MONGODB_TEST_URI === process.env.MONGODB_URI) {
    throw new Error(
      "Explorer API integration tests must use a separate test database connection."
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
      "Explorer API integration tests must use the dedicated contractguard_test_user account."
    );
  }

  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is required for Explorer API integration tests."
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

describe("Specification Explorer API integration", () => {
  it("should list standard, QUERY, custom and referenced Path Item operations", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const specification = await uploadSpecification(
      agent,
      project.id
    );

    const response = await agent
      .get(
        `/api/v1/specifications/${specification.id}/operations`
      )
      .expect(200);

    expect(response.body.success).toBe(true);

    const operations = response.body.data.operations;

    expect(operations).toHaveLength(4);

    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/products",
          operationId: "listProducts",
        }),

        expect.objectContaining({
          method: "QUERY",
          path: "/products",
          operationId: "queryProducts",
        }),

        expect.objectContaining({
          method: "SEARCH",
          path: "/products",
          operationId: "searchProducts",
        }),

        expect.objectContaining({
          method: "POST",
          path: "/shared",
          operationId: "createSharedResource",
        }),
      ])
    );
  });

  it("should resolve referenced parameters and responses in operation details", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const specification = await uploadSpecification(
      agent,
      project.id
    );

    const listing = await agent
      .get(
        `/api/v1/specifications/${specification.id}/operations`
      )
      .expect(200);

    const operation = listing.body.data.operations.find(
      (item) => item.operationId === "listProducts"
    );

    const response = await agent
      .get(
        `/api/v1/specifications/${specification.id}/operations/${encodeURIComponent(operation.operationKey)}`
      )
      .expect(200);

    const result = response.body.data.operation;

    expect(result.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "limit",
          in: "query",
          reference: expect.objectContaining({
            ref: "#/components/parameters/Limit",
            circular: false,
          }),
        }),
      ])
    );

    expect(result.responses["200"].$ref).toBe(
      "#/components/responses/ProductList"
    );

    expect(
      result.resolvedResponses["200"].content[
        "application/json"
      ].schema.items.$ref
    ).toBe("#/components/schemas/Product");

    expect(
      result.responseReferences["200"].targetPointer
    ).toBe("#/components/responses/ProductList");

    expect(result.security).toEqual([]);
  });

  it("should list all reusable component categories", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const specification = await uploadSpecification(
      agent,
      project.id
    );

    const response = await agent
      .get(
        `/api/v1/specifications/${specification.id}/operations`
      )
      .expect(200);

    expect(
      response.body.data.componentCategories
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "schemas",
          count: 1,
        }),

        expect.objectContaining({
          type: "parameters",
          count: 1,
        }),

        expect.objectContaining({
          type: "responses",
          count: 1,
        }),

        expect.objectContaining({
          type: "pathItems",
          count: 1,
        }),
      ])
    );
  });

  it("should list reusable schemas", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const specification = await uploadSpecification(
      agent,
      project.id
    );

    const response = await agent
      .get(
        `/api/v1/specifications/${specification.id}/components/schemas`
      )
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.componentType).toBe("schemas");
    expect(response.body.data.count).toBe(1);

    expect(response.body.data.components[0]).toMatchObject({
      name: "Product",
      pointer: "#/components/schemas/Product",
      isReference: false,
      type: "object",
    });
  });

  it("should retrieve an individual reusable component", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const specification = await uploadSpecification(
      agent,
      project.id
    );

    const response = await agent
      .get(
        `/api/v1/specifications/${specification.id}/components/schemas/Product`
      )
      .expect(200);

    expect(response.body.success).toBe(true);

    expect(response.body.data.componentName).toBe("Product");

    expect(response.body.data.component).toMatchObject({
      type: "object",
      required: ["id", "name"],
    });

    expect(
      response.body.data.component.properties.name.type
    ).toBe("string");
  });

  it("should resolve internal JSON Pointer references", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const specification = await uploadSpecification(
      agent,
      project.id
    );

    const reference =
      "#/components/schemas/Product";

    const response = await agent
      .get(
        `/api/v1/specifications/${specification.id}/references`
      )
      .query({
        ref: reference,
      })
      .expect(200);

    expect(response.body.success).toBe(true);

    expect(response.body.data.reference).toBe(reference);

    expect(response.body.data.targetPointer).toBe(
      "#/components/schemas/Product"
    );

    expect(response.body.data.value).toMatchObject({
      type: "object",
      required: ["id", "name"],
    });

    expect(response.body.data.circular).toBe(false);
  });

  it("should reject missing component categories", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const specification = await uploadSpecification(
      agent,
      project.id
    );

    const response = await agent
      .get(
        `/api/v1/specifications/${specification.id}/components/invalid`
      )
      .expect(400);

    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("should reject missing component names", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const specification = await uploadSpecification(
      agent,
      project.id
    );

    const response = await agent
      .get(
        `/api/v1/specifications/${specification.id}/components/schemas/Missing`
      )
      .expect(404);

    expect(response.body.error.code).toBe(
      "RESOURCE_NOT_FOUND"
    );
  });

  it("should reject unresolved internal references", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const specification = await uploadSpecification(
      agent,
      project.id
    );

    const response = await agent
      .get(
        `/api/v1/specifications/${specification.id}/references`
      )
      .query({
        ref: "#/components/schemas/Missing",
      })
      .expect(404);

    expect(response.body.error.code).toBe(
      "RESOURCE_NOT_FOUND"
    );
  });

  it("should reject external references through the API", async () => {
    const agent = await createAccount();

    const specificationId =
      new mongoose.Types.ObjectId().toString();

    const response = await agent
      .get(
        `/api/v1/specifications/${specificationId}/references`
      )
      .query({
        ref: "https://example.com/schema.json",
      })
      .expect(400);

    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("should reject unauthenticated component requests", async () => {
    const specificationId =
      new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .get(
        `/api/v1/specifications/${specificationId}/components/schemas`
      )
      .expect(401);

    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });
});
