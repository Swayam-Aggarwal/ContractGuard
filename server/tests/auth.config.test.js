
import { describe, expect, it } from "vitest";

import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
  getAuthCookieOptions,
  getClearAuthCookieOptions,
} from "../src/config/auth.js";

describe("Authentication cookie configuration", () => {
  it("should use the correct cookie name", () => {
    expect(AUTH_COOKIE_NAME).toBe("cg_access");
  });

  it("should configure a secure cookie for production", () => {
    const options = getAuthCookieOptions("production");

    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/v1",
      maxAge: 30 * 60 * 1000,
    });
  });

  it("should disable Secure for local development", () => {
    const options = getAuthCookieOptions("development");

    expect(options.secure).toBe(false);
    expect(options.httpOnly).toBe(true);
  });

  it("should use the same cookie attributes when clearing the cookie", () => {
    const setOptions = getAuthCookieOptions("production");
    const clearOptions = getClearAuthCookieOptions("production");

    expect(clearOptions).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/v1",
    });

    expect(clearOptions.path).toBe(setOptions.path);
    expect(clearOptions).not.toHaveProperty("maxAge");
    expect(AUTH_COOKIE_MAX_AGE_MS).toBe(1800000);
  });
});
