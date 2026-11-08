
import bcrypt from "bcrypt";

export const BCRYPT_SALT_ROUNDS = 12;

export const MIN_PASSWORD_LENGTH = 15;

export const MAX_PASSWORD_BYTES = 72;

const BCRYPT_HASH_PATTERN =
  /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// Normalize passwords consistently and enforce bcrypt's byte limit.
const normalizePassword = (password) => {
  if (typeof password !== "string") {
    throw new TypeError("Password must be a string.");
  }

  // Unicode NFC normalization
  const normalizedPassword = password.normalize("NFC");

  const byteLength = Buffer.byteLength(
    normalizedPassword,
    "utf8"
  );

  if (byteLength > MAX_PASSWORD_BYTES) {
    throw new RangeError(
      "Password must not exceed 72 UTF-8 bytes."
    );
  }

  return normalizedPassword;
};

// Apply the requirements for newly created passwords.
export const validateNewPassword = (password) => {
  const normalizedPassword = normalizePassword(password);

  // Count Unicode code points, not UTF-16 code units.
  const characterCount = Array.from(
    normalizedPassword
  ).length;

  if (characterCount < MIN_PASSWORD_LENGTH) {
    throw new RangeError(
      `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }

  return normalizedPassword;
};

// Hash a new password asynchronously.
export const hashPassword = async (password) => {
  const normalizedPassword = validateNewPassword(password);

  return bcrypt.hash(
    normalizedPassword,
    BCRYPT_SALT_ROUNDS
  );
};

// Verify a submitted password against an existing bcrypt hash.
export const verifyPassword = async (
  password,
  passwordHash
) => {
  const normalizedPassword = normalizePassword(password);

  if (
    typeof passwordHash !== "string" ||
    !BCRYPT_HASH_PATTERN.test(passwordHash)
  ) {
    return false;
  }

  return bcrypt.compare(
    normalizedPassword,
    passwordHash
  );
};
