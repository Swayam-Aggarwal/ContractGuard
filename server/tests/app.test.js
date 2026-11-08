import { describe, expect, it } from "vitest";
import request from "supertest";

import createApp from "../src/app.js";

const app = createApp({
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:5173",
  JWT_SECRET: "A".repeat(64),
  JWT_EXPIRES_IN: "30m",
});

describe("GET /api/v1/health", () => {
  it("should return the API health status", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        status: "ok",
        service: "ContractGuard API",
      },
    });

    expect(
      response.headers["x-content-type-options"]
    ).toBe("nosniff");
  });
});

describe("Unknown routes", () => {
  it("should return a standardized JSON 404 response", async () => {
    const response = await request(app)
      .get("/api/v1/unknown")
      .expect("Content-Type", /json/)
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "The requested route was not found.",
        details: [],
      },
    });
  });
});

describe("Authentication routes", () => {
  it("should reject access to the current-user endpoint without authentication", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .expect(401);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication is required.",
        details: [],
      },
    });
  });

  it("should reject invalid login request data", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "http://localhost:5173")
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });
});

describe("Malformed JSON requests", () => {
  it("should return a standardized error response", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Content-Type", "application/json")
      .send("{invalid-json")
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Request body contains invalid JSON.",
        details: [],
      },
    });
  });
});