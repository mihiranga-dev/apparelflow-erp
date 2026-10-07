import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Every test file shares the same Postgres DB. Serial execution prevents
    // cross-file races on TRUNCATE/INSERT sequences.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    // Keep test output compact — no per-test timing noise.
    reporters: ["default"],
  },
});
