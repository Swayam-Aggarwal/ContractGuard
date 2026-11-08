
import express from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";

import createOriginMiddleware from "../src/middleware/origin.middleware.js";

import {
  registrationRateLimiter,
  loginRateLimiter,
} from "../src/middleware/authRateLimit.middleware.js";

const createOriginTestApp = () => {
  const app = express();

  app.use(
    createOriginMiddleware("http://localhost:5173")
  );

  app.post("/mutate", (req, res) => {
    res.status(200).json({
      success: true,
    });
  });

  app.get("/read", (req, res) => {
    res.status(200).json({
      success: true,
    });
  });

  return app;
};

describe("Origin protection", () => {
  const app = createOriginTestApp();

  it("should allow requests from the configured origin", async () => {
    await request(app)
      .post("/mutate")
      .set("Origin", "http://localhost:5173")
      .expect(200);
  });

  it("should reject requests from an untrusted origin", async () => {
    const response = await request(app)
      .post("/mutate")
      .set("Origin", "http://attacker.example")
      .expect(403);

    expect(response.body.error.code)
      .toBe("ORIGIN_NOT_ALLOWED");
  });

  it("should reject a null origin", async () => {
    await request(app)
      .post("/mutate")
      .set("Origin", "null")
      .expect(403);
  });

  it("should use a valid Referer when Origin is absent", async () => {
    await request(app)
      .post("/mutate")
      .set("Referer", "http://localhost:5173/login")
      .expect(200);
  });

  it("should reject requests without Origin or Referer", async () => {
    await request(app)
      .post("/mutate")
      .expect(403);
  });

  it("should reject an invalid Origin even with a trusted Referer", async () => {
    await request(app)
      .post("/mutate")
      .set("Origin", "http://attacker.example")
      .set("Referer", "http://localhost:5173/login")
      .expect(403);
  });

  it("should allow GET requests without Origin", async () => {
    await request(app)
      .get("/read")
      .expect(200);
  });
});

describe("Registration rate limiter", () => {
  const app = express();

  app.post(
    "/register",
    registrationRateLimiter,
    (req, res) => {
      res.status(201).json({
        success: true,
      });
    }
  );

  it("should reject the sixth registration attempt within the window", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await request(app)
        .post("/register")
        .expect(201);
    }

    const response = await request(app)
      .post("/register")
      .expect(429);

    expect(response.body.error.code)
      .toBe("RATE_LIMITED");
  });
});

describe("Login rate limiter", () => {
  const app = express();

  app.post(
    "/login",
    loginRateLimiter,
    (req, res) => {
      // Simulate incorrect login credentials
      res.status(401).json({
        success: false,
      });
    }
  );

  it("should reject the eleventh failed login attempt within the window", async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await request(app)
        .post("/login")
        .expect(401);
    }

    const response = await request(app)
      .post("/login")
      .expect(429);

    expect(response.body.error.code)
      .toBe("RATE_LIMITED");
  });
});
