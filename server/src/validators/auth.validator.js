import { z } from "zod";

import {
  MAX_PASSWORD_BYTES,
  validateNewPassword,
} from "../utils/password.js";

const registerPasswordSchema = z
  .string()
  .superRefine((password, context) => {
    try {
      validateNewPassword(password);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error.message,
      });
    }
  });

const loginPasswordSchema = z
  .string()
  .min(1, "Password is required.")
  .superRefine((password, context) => {
    const normalizedPassword = password.normalize("NFC");

    if (
      Buffer.byteLength(normalizedPassword, "utf8") >
      MAX_PASSWORD_BYTES
    ) {
      context.addIssue({
        code: "custom",
        message: `Password must not exceed ${MAX_PASSWORD_BYTES} UTF-8 bytes.`,
      });
    }
  });

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email must not exceed 254 characters.")
  .pipe(
    z.email({
      error: "Enter a valid email address.",
    })
  );

const displayNameSchema = z
  .string()
  .trim()
  .max(80, "Display name must not exceed 80 characters.")
  .transform((value) => value || undefined)
  .optional();

export const registerSchema = z
  .object({
    email: emailSchema,
    password: registerPasswordSchema,
    displayName: displayNameSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: loginPasswordSchema,
  })
  .strict();