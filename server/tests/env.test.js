import {
  describe,
  expect,
  it,
} from "vitest";

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
  it("accepts valid environment variables and AI defaults", () => {
    const config = parseEnv(validEnvironment);

    expect(config.NODE_ENV).toBe("test");
    expect(config.PORT).toBe(5000);
    expect(config.APP_ORIGIN).toBe("http://localhost:5173");
    expect(config.JWT_EXPIRES_IN).toBe("30m");

    expect(config.GEMINI_API_KEY).toBe("");
    expect(config.GEMINI_MODEL).toBe("gemini-3.8-flash");
  });

  it("accepts optional server-side Gemini configuration", () => {
    const config = parseEnv({
      ...validEnvironment,
      GEMINI_API_KEY: "synthetic-test-key",
      GEMINI_MODEL: "gemini-3.8-flash",
    });

    expect(config.GEMINI_API_KEY).toBe(
      "synthetic-test-key"
    );

    expect(config.GEMINI_MODEL).toBe(
      "gemini-3.8-flash"
    );
  });

  it("uses the default model when the environment model is empty", () => {
    const config = parseEnv({
      ...validEnvironment,
      GEMINI_MODEL: "",
    });

    expect(config.GEMINI_MODEL).toBe(
      "gemini-3.8-flash"
    );
  });

  it("rejects a different Gemini model", () => {
    expect(() =>
      parseEnv({
        ...validEnvironment,
        GEMINI_MODEL: "some-paid-only-model",
      })
    ).toThrow("GEMINI_MODEL");
  });

  it("rejects a missing MongoDB URI", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      MONGODB_URI: "",
    };

    expect(() =>
      parseEnv(invalidEnvironment)
    ).toThrow("MONGODB_URI");
  });

  it("rejects an invalid port", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      PORT: "99999",
    };

    expect(() =>
      parseEnv(invalidEnvironment)
    ).toThrow("PORT");
  });

  it("rejects an invalid JWT secret", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      JWT_SECRET: "weak-secret",
    };

    expect(() =>
      parseEnv(invalidEnvironment)
    ).toThrow("JWT_SECRET");
  });

  it("rejects an unsupported JWT expiry", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      JWT_EXPIRES_IN: "15m",
    };

    expect(() =>
      parseEnv(invalidEnvironment)
    ).toThrow("JWT_EXPIRES_IN");
  });
});