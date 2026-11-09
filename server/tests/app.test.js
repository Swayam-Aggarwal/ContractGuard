
import { describe, expect, it } from "vitest";
import request from "supertest";

import createApp from "../src/app.js";

const APP_ORIGIN = "http://localhost:5173";

const app = createApp({
  NODE_ENV: "test",
  APP_ORIGIN,
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

describe("CORS", () => {
  it("should allow the configured frontend origin", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .set("Origin", APP_ORIGIN)
      .expect(200);

    expect(
      response.headers["access-control-allow-origin"]
    ).toBe(APP_ORIGIN);

    expect(
      response.headers["access-control-allow-credentials"]
    ).toBe("true");
  });

  it("should complete a valid browser preflight request", async () => {
    const response = await request(app)
      .options("/api/v1/projects")
      .set("Origin", APP_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(204);

    expect(
      response.headers["access-control-allow-origin"]
    ).toBe(APP_ORIGIN);

    expect(
      response.headers["access-control-allow-credentials"]
    ).toBe("true");

    expect(
      response.headers["access-control-allow-methods"]
    ).toContain("POST");

    expect(
      response.headers["access-control-allow-headers"]
    ).toContain("Content-Type");
  });

  it("should not grant CORS access to an unconfigured origin", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://untrusted.example")
      .expect(200);

    expect(
      response.headers["access-control-allow-origin"]
    ).toBeUndefined();
  });

  it("should reject preflight requests containing unapproved headers", async () => {
    await request(app)
      .options("/api/v1/projects")
      .set("Origin", APP_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "x-unknown-header")
      .expect(400);
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
      .set("Origin", APP_ORIGIN)
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
      .set("Origin", APP_ORIGIN)
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
