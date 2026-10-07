import "dotenv/config"; // harmless if already loaded
import { afterAll } from "vitest";

// Hard guard: refuse to run against anything that isn't explicitly a test env.
// This is the single most important line in the suite — it stands between a
// misconfigured CI job and a truncated production database.
if (process.env.NODE_ENV !== "test") {
  throw new Error(
    "Refusing to run tests without NODE_ENV=test — the suite truncates tables.",
  );
}

// Ensure the JWT secret has the minimum length the env validator requires.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "test-only-secret-please-ignore-0123456789abcdef";
}

// Close DB connections after the run so Vitest exits cleanly.
afterAll(async () => {
  const { db } = await import("../src/db/client");
  // postgres-js exposes the underlying socket pool on the drizzle client.
  // `end()` is idempotent and a no-op if already closed.
  await (
    db as unknown as { $client?: { end: () => Promise<void> } }
  ).$client?.end?.();
});
