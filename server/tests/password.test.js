
import { describe, expect, it } from "vitest";
import bcrypt from "bcrypt";

import {
  BCRYPT_SALT_ROUNDS,
  hashPassword,
  verifyPassword,
} from "../src/utils/password.js";

describe("Password utilities", () => {
  it("should hash and correctly verify a password", async () => {
    const password = "correct horse battery staple";

    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);

    expect(bcrypt.getRounds(passwordHash))
      .toBe(BCRYPT_SALT_ROUNDS);

    expect(await verifyPassword(password, passwordHash))
      .toBe(true);

    expect(
      await verifyPassword(
        "another incorrect password",
        passwordHash
      )
    ).toBe(false);
  });

  it("should reject passwords shorter than 15 characters", async () => {
    await expect(
      hashPassword("short-password")
    ).rejects.toThrow("at least 15 characters");
  });

  it("should reject passwords exceeding 72 UTF-8 bytes", async () => {
    const longPassword = "é".repeat(37);

    await expect(
      hashPassword(longPassword)
    ).rejects.toThrow("72 UTF-8 bytes");
  });

  it("should normalize Unicode consistently before hashing and verification", async () => {
    const decomposedPassword =
      "Cafe\u0301 morning garden walk 2042";

    const composedPassword =
      "Café morning garden walk 2042";

    const passwordHash = await hashPassword(
      decomposedPassword
    );

    expect(
      await verifyPassword(
        composedPassword,
        passwordHash
      )
    ).toBe(true);
  });
});
