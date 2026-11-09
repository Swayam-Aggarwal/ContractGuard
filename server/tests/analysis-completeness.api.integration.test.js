
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

const COMPLETE_SPECIFICATION = {
  openapi: "3.2.1",

  info: {
    title: "ContractGuard Complete Test API",
    version: "1.0.0",
  },

  paths: {
    "/health": {
      get: {
        operationId: "getHealth",
        summary: "Check health",

        responses: {
          "200": {
            description: "Healthy.",
          },
        },
      },
    },
  },
};

const COMPLETE_SPEC_SOURCE = JSON.stringify(
  COMPLETE_SPECIFICATION
);

const PARTIAL_SPECIFICATION = {
  openapi: "3.2.1",

  info: {
    title: "ContractGuard Partial Test API",
    version: "1.0.0",
  },

  paths: {
    "/products": {
      get: {
        operationId: "listProducts",
        summary: "List products",

        parameters: [
          {
            name: "filter",
            in: "querystring",
            content: {
              "application/x-www-form-urlencoded": {
                schema: {
                  type: "object",
                  properties: {
                    category: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        ],

        responses: {
          "200": {
            description: "Product list.",

            content: {
              "application/json": {
                itemSchema: {
                  type: "string",
                },
              },
            },
          },
        },

        callbacks: {
          onProductEvent: {
            "{$request.body#/callbackUrl}": {
              post: {
                responses: {
                  "200": {
                    description: "Callback accepted.",
                  },
                },
              },
            },
          },
        },
      },

      query: {
        operationId: "searchProducts",
        summary: "Search products",

        responses: {
          "200": {
            description: "Search results.",
          },
        },
      },

      additionalOperations: {
        COPY: {
          operationId: "copyProducts",
          summary: "Copy products",

          responses: {
            "200": {
              description: "Products copied.",
            },
          },
        },
      },
    },
  },

  webhooks: {
    orderCreated: {
      post: {
        responses: {
          "200": {
            description: "Order webhook received.",
          },
        },
      },
    },
  },

  jsonSchemaDialect:
    "https://spec.openapis.org/oas/3.2/dialect/base",

  components: {
    pathItems: {
      SharedInventory: {
        get: {
          responses: {
            "200": {
              description: "Inventory response.",
            },
          },
        },
      },
    },

    mediaTypes: {
      ProductJson: {
        schema: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
          },
        },
      },
    },

    schemas: {
      Node: {
        type: "object",
        properties: {
          child: {
            $dynamicRef: "#node",
          },
        },
      },
    },
  },
};

const PARTIAL_SPEC_SOURCE = JSON.stringify(
  PARTIAL_SPECIFICATION
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
    `explorer-completeness-${accountCounter}@example.com`;

  await User.create({
    email,
    passwordHash: testPasswordHash,
    displayName: "Explorer Completeness Test User",
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
      name: "Explorer Completeness Test Project",
      description:
        "Integration testing for explorer completeness.",
    })
    .expect(201);

  return response.body.data.project;
};

const uploadSpecification = (
  agent,
  projectId,
  sourceText,
  filename
) => {
  return agent
    .post(`/api/v1/projects/${projectId}/specifications`)
    .set("Origin", APP_ORIGIN)
    .attach(
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
      "MONGODB_TEST_URI is required for explorer completeness integration tests."
    );
  }

  if (MONGODB_TEST_URI === process.env.MONGODB_URI) {
    throw new Error(
      "Explorer completeness integration tests must use a separate test database connection."
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
      "Explorer completeness integration tests must use the dedicated contractguard_test_user account."
    );
  }

  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is required for explorer completeness integration tests."
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

describe("Explorer completeness API integration", () => {
  it("should persist and return COMPLETE status across specification APIs", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const upload = await uploadSpecification(
      agent,
      project.id,
      COMPLETE_SPEC_SOURCE,
      "complete-openapi-3.2.1.json"
    ).expect(201);

    const specification = upload.body.data.specification;

    expect(specification.explorerCompleteness).toBe(
      "COMPLETE"
    );

    expect(specification.explorerWarnings).toEqual([]);

    const stored = await SpecVersion.findById(
      specification.id
    ).lean();

    expect(stored.explorerCompleteness).toBe("COMPLETE");
    expect(stored.explorerWarnings).toEqual([]);

    const versionList = await agent
      .get(`/api/v1/projects/${project.id}/specifications`)
      .expect(200);

    const listedSpecification =
      versionList.body.data.specifications.find(
        (item) => item.id === specification.id
      );

    expect(listedSpecification.explorerCompleteness).toBe(
      "COMPLETE"
    );

    expect(listedSpecification.explorerWarnings).toEqual([]);

    const detail = await agent
      .get(`/api/v1/specifications/${specification.id}`)
      .expect(200);

    expect(
      detail.body.data.specification.explorerCompleteness
    ).toBe("COMPLETE");

    const operations = await agent
      .get(
        `/api/v1/specifications/${specification.id}/operations`
      )
      .expect(200);

    expect(
      operations.body.data.specification.explorerCompleteness
    ).toBe("COMPLETE");

    const operationKey =
      operations.body.data.operations[0].operationKey;

    const operationDetail = await agent
      .get(
        `/api/v1/specifications/${specification.id}/operations/${encodeURIComponent(operationKey)}`
      )
      .expect(200);

    expect(
      operationDetail.body.data.specification.explorerCompleteness
    ).toBe("COMPLETE");
  });

  it("should persist PARTIAL status and warnings across specification APIs", async () => {
    const agent = await createAccount();
    const project = await createProject(agent);

    const upload = await uploadSpecification(
      agent,
      project.id,
      PARTIAL_SPEC_SOURCE,
      "partial-openapi-3.2.1.json"
    ).expect(201);

    const specification = upload.body.data.specification;

    expect(specification.explorerCompleteness).toBe(
      "PARTIAL"
    );

    expect(specification.explorerWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "paths./products.get.parameters.0.in",
        }),

        expect.objectContaining({
          field: "paths./products.get.responses.200.content.application/json.itemSchema",
        }),

        expect.objectContaining({
          field:
            "components.schemas.Node.properties.child.$dynamicRef",
        }),

        expect.objectContaining({
          field: "jsonSchemaDialect",
        }),
      ])
    );

    const stored = await SpecVersion.findById(
      specification.id
    ).lean();

    expect(stored.explorerCompleteness).toBe("PARTIAL");

    expect(stored.explorerWarnings).toEqual(
      specification.explorerWarnings
    );

    const versionList = await agent
      .get(`/api/v1/projects/${project.id}/specifications`)
      .expect(200);

    const listedSpecification =
      versionList.body.data.specifications.find(
        (item) => item.id === specification.id
      );

    expect(listedSpecification.explorerCompleteness).toBe(
      "PARTIAL"
    );

    expect(listedSpecification.explorerWarnings).toEqual(
      specification.explorerWarnings
    );

    const detail = await agent
      .get(`/api/v1/specifications/${specification.id}`)
      .expect(200);

    expect(
      detail.body.data.specification.explorerCompleteness
    ).toBe("PARTIAL");

    expect(
      detail.body.data.specification.explorerWarnings
    ).toEqual(specification.explorerWarnings);

    const operations = await agent
      .get(
        `/api/v1/specifications/${specification.id}/operations`
      )
      .expect(200);

    expect(
      operations.body.data.specification.explorerCompleteness
    ).toBe("PARTIAL");

    expect(
      operations.body.data.specification.explorerWarnings
    ).toEqual(specification.explorerWarnings);

    expect(
      operations.body.data.operations.map(
        (operation) => operation.method
      )
    ).toEqual(
      expect.arrayContaining([
        "GET",
        "QUERY",
        "COPY",
        "POST",
      ])
    );

    const listProducts =
      operations.body.data.operations.find(
        (operation) => operation.operationId === "listProducts"
      );

    const operationDetail = await agent
      .get(
        `/api/v1/specifications/${specification.id}/operations/${encodeURIComponent(listProducts.operationKey)}`
      )
      .expect(200);

    expect(
      operationDetail.body.data.specification.explorerCompleteness
    ).toBe("PARTIAL");

    expect(
      operationDetail.body.data.operation.operationId
    ).toBe("listProducts");
  });
});
