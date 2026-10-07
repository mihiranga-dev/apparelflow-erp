import dotenv from "dotenv";
import { z } from "zod";

// Prefer .env.test during test runs so a test DB URL can be isolated from dev.
dotenv.config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
});

/**
 * Fail-fast env validation. If any required variable is missing or malformed,
 * the process exits immediately with a readable error instead of crashing later
 * deep inside a request handler.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
