import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll } from "vitest";

// ─── 0. Load .env.test with override ────────────────────────────────────────
// The `import 'dotenv/config'` shorthand loads the DEFAULT `.env` file — which
// is production here. That is what caused the earlier guard to compare two
// copies of the production URL and conclude they "matched". We load .env.test
// explicitly and with `override: true` so any value from `.env` that an earlier
// import may have placed in process.env is replaced.
const envTestCandidates = [
  resolve(process.cwd(), ".env.test"), // vitest runs with cwd=server/
  resolve(process.cwd(), "server/.env.test"), // fallback if run from repo root
];
const envTestPath = envTestCandidates.find((p) => existsSync(p));

if (!envTestPath) {
  throw new Error(
    `Could not find .env.test — refusing to run tests. Looked in:\n` +
      envTestCandidates.map((p) => "  - " + p).join("\n"),
  );
}
dotenv.config({ path: envTestPath, override: true });

// ─── 1. Guard: NODE_ENV must be 'test' ─────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  throw new Error(
    "Refusing to run tests without NODE_ENV=test — the suite truncates tables.",
  );
}

// ─── 2. Guard: test DATABASE_URL must not equal dev DATABASE_URL ───────────
function refuseIfProdUrlMatches(): void {
  const testUrl = process.env.DATABASE_URL;
  if (!testUrl) {
    throw new Error("DATABASE_URL is not set after loading .env.test.");
  }

  // Read .env directly from disk — deliberately NOT from process.env, whose
  // DATABASE_URL is now the test value and would trivially "not match".
  const envCandidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "server/.env"),
  ];
  let envText: string | null = null;
  let usedPath = "";
  for (const p of envCandidates) {
    if (existsSync(p)) {
      envText = readFileSync(p, "utf8");
      usedPath = p;
      break;
    }
  }

  console.log("");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  Test DB URL guard");
  console.log(
    "───────────────────────────────────────────────────────────────",
  );
  console.log(`  test DATABASE_URL  (process.env after .env.test):`);
  console.log(`    ${testUrl}`);
  console.log(`  test DB URL source: ${envTestPath}`);

  if (!envText) {
    console.log(`  dev  DATABASE_URL  (no .env found — skipping comparison)`);
    console.log("  match?             n/a — proceeding");
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("");
    return;
  }

  const match = envText.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m);
  const devUrl = match ? match[1]!.replace(/^["']|["']$/g, "") : "";

  console.log(`  dev  DATABASE_URL  (from ${usedPath}):`);
  console.log(`    ${devUrl || "(not set)"}`);
  console.log(
    `  match?             ${devUrl && testUrl === devUrl ? "YES — REFUSING" : "no — proceeding"}`,
  );
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("");

  if (devUrl && testUrl === devUrl) {
    throw new Error(
      "REFUSING TO RUN: test DATABASE_URL matches the dev/production " +
        "DATABASE_URL in server/.env. The test suite TRUNCATEs every table.",
    );
  }
}

refuseIfProdUrlMatches();

// ─── 3. Ensure JWT secret meets the env validator's length rule ────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "test-only-secret-please-ignore-0123456789abcdef";
}

// ─── 4. Close DB connections so vitest exits cleanly ───────────────────────
afterAll(async () => {
  const { db } = await import("../src/db/client");
  await (
    db as unknown as { $client?: { end: () => Promise<void> } }
  ).$client?.end?.();
});
