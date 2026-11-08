
import { describe, expect, it } from "vitest";

import parseEnv from "../src/config/env.js";

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "5000",
  APP_ORIGIN: "http://localhost:5173",
  MONGODB_URI:
    "mongodb+srv://test-user:test-password@example.mongodb.net/contractguard",
  JWT_SECRET: "A".repeat(64),
};

describe("Environment configuration", () => {
  it("should accept valid environment variables", () => {
    const config = parseEnv(validEnvironment);

    expect(config.NODE_ENV).toBe("test");
    expect(config.PORT).toBe(5000);
    expect(config.APP_ORIGIN).toBe("http://localhost:5173");
    expect(config.JWT_EXPIRES_IN).toBe("30m");
  });

  it("should reject a missing MongoDB URI", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      MONGODB_URI: "",
    };

    expect(() => parseEnv(invalidEnvironment))
      .toThrow("MONGODB_URI");
  });

  it("should reject an invalid port", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      PORT: "99999",
    };

    expect(() => parseEnv(invalidEnvironment))
      .toThrow("PORT");
  });

  it("should reject an invalid JWT secret", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      JWT_SECRET: "weak-secret",
    };

    expect(() => parseEnv(invalidEnvironment))
      .toThrow("JWT_SECRET");
  });

  it("should reject an unsupported JWT expiry", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      JWT_EXPIRES_IN: "15m",
    };

    expect(() => parseEnv(invalidEnvironment))
      .toThrow("JWT_EXPIRES_IN");
  });
});
