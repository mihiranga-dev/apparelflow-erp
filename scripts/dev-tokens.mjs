/**
 * Dev helper — logs in as all three demo users and writes their JWT tokens
 * to scripts/.tokens.env. Source that file into your current shell.
 *
 * Usage:
 *   node scripts/dev-tokens.mjs       # refresh tokens
 *   source scripts/.tokens.env        # load into current shell
 *
 * Never commit the output file — see .gitignore.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const API = process.env.API_BASE ?? "http://localhost:4000";
const OUT_PATH = "scripts/.tokens.env";

const USERS = [
  { email: "supervisor@apparelflow.com", password: "Password123", env: "SUP" },
  { email: "verifier@apparelflow.com", password: "Password123", env: "VER" },
  { email: "sewing@apparelflow.com", password: "Password123", env: "SEW" },
];

let out = "# Auto-generated dev tokens. DO NOT COMMIT.\n";
out += `# Generated at ${new Date().toISOString()}\n`;

for (const u of USERS) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: u.email, password: u.password }),
  });
  if (!res.ok) {
    console.error(`✗ Login failed for ${u.email}: HTTP ${res.status}`);
    process.exit(1);
  }
  const body = await res.json();
  out += `export ${u.env}="${body.token}"\n`;
  console.log(`✓ ${u.env} = ${u.email} (${body.user.role})`);
}

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, out);
console.log(`\nWrote ${OUT_PATH}`);
console.log("Now run: source scripts/.tokens.env");
