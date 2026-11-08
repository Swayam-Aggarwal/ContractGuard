
import { describe, expect, it } from "vitest";

import User from "../src/models/user.model.js";

const VALID_BCRYPT_HASH =
  "$2b$12$" + "a".repeat(53);

describe("User model", () => {
  it("should normalize email and display name", async () => {
    const user = new User({
      email: " Swayam@Example.com ",
      passwordHash: VALID_BCRYPT_HASH,
      displayName: " Swayam ",
    });

    expect(user.email).toBe("swayam@example.com");
    expect(user.displayName).toBe("Swayam");

    await expect(user.validate()).resolves.toBeUndefined();
  });

  it("should require email and password hash", async () => {
    const user = new User();

    const result = await user.validate().then(
      () => ({ error: null }),
      (error) => ({ error })
    );

    expect(result.error).not.toBeNull();
    expect(result.error.errors.email).toBeDefined();
    expect(result.error.errors.passwordHash).toBeDefined();
  });

  it("should exclude passwordHash from normal queries", () => {
    expect(
      User.schema.path("passwordHash").options.select
    ).toBe(false);
  });

  it("should remove passwordHash during serialization", () => {
    const user = new User({
      email: "test@example.com",
      passwordHash: VALID_BCRYPT_HASH,
    });

    expect(user.toJSON()).not.toHaveProperty("passwordHash");

    expect(user.toObject()).not.toHaveProperty("passwordHash");
  });

  it("should define a unique email index and timestamps", () => {
    const emailIndex = User.schema
      .indexes()
      .find(([fields]) => fields.email === 1);

    expect(emailIndex).toBeDefined();
    expect(emailIndex[1].unique).toBe(true);

    expect(User.schema.options.timestamps).toBe(true);
    expect(User.collection.collectionName).toBe("users");
  });
});
