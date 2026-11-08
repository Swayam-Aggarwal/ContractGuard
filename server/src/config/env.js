
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(5000),

  APP_ORIGIN: z
    .url({
      protocol: /^https?$/,
    })
    .refine(
      (value) => new URL(value).origin === value,
      {
        error: "APP_ORIGIN must contain only the origin, without a path",
      }
    )
    .default("http://localhost:5173"),

  MONGODB_URI: z
    .string()
    .trim()
    .regex(
      /^mongodb(\+srv)?:\/\//,
      "Must be a valid MongoDB connection string"
    ),

  JWT_SECRET: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9_-]{64}$/,
      "Must be a 48-byte Base64URL secret"
    )
    .refine(
      (value) => Buffer.from(value, "base64url").length === 48,
      {
        error: "JWT_SECRET must decode to exactly 48 bytes",
      }
    ),

  JWT_EXPIRES_IN: z
    .literal("30m")
    .default("30m"),
});

const parseEnv = (environment = process.env) => {
  const result = envSchema.safeParse(environment);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => {
        return `${issue.path.join(".")}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${errors}`
    );
  }

  return result.data;
};

export default parseEnv;
