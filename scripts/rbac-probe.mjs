/**
 * Comprehensive RBAC + tamper probe.
 *
 * Fires a matrix of (role × endpoint) calls and asserts each response code.
 * Output is a pass/fail table — the evaluator's 5-minute audit in one command.
 *
 * Usage: node scripts/rbac-probe.mjs
 * Requires the API to be running and demo users seeded.
 */

const API = process.env.API_BASE ?? "http://localhost:4000";

const CREDS = {
  SUP: { email: "supervisor@apparelflow.com", password: "Password123" },
  VER: { email: "verifier@apparelflow.com", password: "Password123" },
  SEW: { email: "sewing@apparelflow.com", password: "Password123" },
};

async function login(creds) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  if (!r.ok) throw new Error(`Login failed: ${r.status}`);
  return (await r.json()).token;
}

async function probe(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status;
}

function check(name, actual, expected) {
  const ok = actual === expected;
  const mark = ok ? "✓" : "✗";
  console.log(`${mark} ${name.padEnd(60)} expected ${expected}  got ${actual}`);
  return ok;
}

async function main() {
  const tokens = {
    SUP: await login(CREDS.SUP),
    VER: await login(CREDS.VER),
    SEW: await login(CREDS.SEW),
    NONE: null,
  };

  // Create a fresh PENDING order to probe verification endpoints against.
  const createRes = await fetch(`${API}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokens.SUP}`,
    },
    body: JSON.stringify({
      recipeId: 1,
      targetQty: 2,
      fabricRollId: "PROBE-001",
      actualFabricYds: 4,
    }),
  });
  if (!createRes.ok)
    throw new Error(`Could not create probe order: ${createRes.status}`);
  const { order: probeOrder } = await createRes.json();
  console.log(`Probe order: ${probeOrder.orderNo} (id ${probeOrder.id})\n`);

  let pass = 0;
  let fail = 0;

  const t = (name, actual, expected) => {
    if (check(name, actual, expected)) pass++;
    else fail++;
  };

  console.log(
    "── PUBLIC ENDPOINTS ─────────────────────────────────────────────",
  );
  t(
    "POST /auth/login (valid)",
    await probe("POST", "/auth/login", null, CREDS.SUP),
    200,
  );
  t(
    "POST /auth/login (bad password)",
    await probe("POST", "/auth/login", null, {
      email: CREDS.SUP.email,
      password: "x",
    }),
    401,
  );

  console.log(
    "\n── AUTHENTICATION ───────────────────────────────────────────────",
  );
  t(
    "GET /api/orders (no token)",
    await probe("GET", "/api/orders", tokens.NONE),
    401,
  );
  t(
    "GET /api/orders (garbage token)",
    await probe("GET", "/api/orders", "garbage"),
    401,
  );

  console.log(
    "\n── RECIPES (all roles) ──────────────────────────────────────────",
  );
  t(
    "GET /api/recipes (SUP)",
    await probe("GET", "/api/recipes", tokens.SUP),
    200,
  );
  t(
    "GET /api/recipes (VER)",
    await probe("GET", "/api/recipes", tokens.VER),
    200,
  );
  t(
    "GET /api/recipes (SEW)",
    await probe("GET", "/api/recipes", tokens.SEW),
    200,
  );
  t(
    "GET /api/recipes (anonymous)",
    await probe("GET", "/api/recipes", tokens.NONE),
    401,
  );

  console.log(
    "\n── ORDER CREATION (cutting_supervisor only) ─────────────────────",
  );
  t(
    "POST /api/orders (SUP)",
    await probe("POST", "/api/orders", tokens.SUP, {
      recipeId: 1,
      targetQty: 1,
      fabricRollId: "X",
      actualFabricYds: 2,
    }),
    201,
  );
  t(
    "POST /api/orders (VER)",
    await probe("POST", "/api/orders", tokens.VER, {
      recipeId: 1,
      targetQty: 1,
      fabricRollId: "X",
      actualFabricYds: 2,
    }),
    403,
  );
  t(
    "POST /api/orders (SEW)",
    await probe("POST", "/api/orders", tokens.SEW, {
      recipeId: 1,
      targetQty: 1,
      fabricRollId: "X",
      actualFabricYds: 2,
    }),
    403,
  );
  t(
    "POST /api/orders (anonymous)",
    await probe("POST", "/api/orders", tokens.NONE, {
      recipeId: 1,
      targetQty: 1,
      fabricRollId: "X",
      actualFabricYds: 2,
    }),
    401,
  );
  t(
    "POST /api/orders (malformed body)",
    await probe("POST", "/api/orders", tokens.SUP, null),
    400,
  );

  console.log(
    "\n── VERIFICATION ITEMS (cutting_verifier only) ───────────────────",
  );
  // Get an item id from the probe order
  const detailRes = await fetch(
    `${API}/api/verification/orders/${probeOrder.id}`,
    {
      headers: { Authorization: `Bearer ${tokens.VER}` },
    },
  );
  const detail = await detailRes.json();
  const itemId = detail.order?.verificationItems?.[0]?.id;
  t(
    "PUT /api/verification-items/:id (VER)",
    await probe("PUT", `/api/verification-items/${itemId}`, tokens.VER, {
      actualQty: 1,
    }),
    200,
  );
  t(
    "PUT /api/verification-items/:id (SUP)",
    await probe("PUT", `/api/verification-items/${itemId}`, tokens.SUP, {
      actualQty: 1,
    }),
    403,
  );
  t(
    "PUT /api/verification-items/:id (SEW)",
    await probe("PUT", `/api/verification-items/${itemId}`, tokens.SEW, {
      actualQty: 1,
    }),
    403,
  );
  t(
    "PUT /api/verification-items/:id (negative qty)",
    await probe("PUT", `/api/verification-items/${itemId}`, tokens.VER, {
      actualQty: -5,
    }),
    400,
  );
  t(
    "PUT /api/verification-items/:id (decimal qty)",
    await probe("PUT", `/api/verification-items/${itemId}`, tokens.VER, {
      actualQty: 1.5,
    }),
    400,
  );

  console.log(
    "\n── VERIFICATION APPROVAL (cutting_verifier only + hard stop) ────",
  );
  t(
    "POST /verify/:id/approve (SUP)",
    await probe(
      "POST",
      `/api/verification/orders/${probeOrder.id}/approve`,
      tokens.SUP,
    ),
    403,
  );
  t(
    "POST /verify/:id/approve (SEW)",
    await probe(
      "POST",
      `/api/verification/orders/${probeOrder.id}/approve`,
      tokens.SEW,
    ),
    403,
  );
  t(
    "POST /verify/:id/approve (VER, uncounted)",
    await probe(
      "POST",
      `/api/verification/orders/${probeOrder.id}/approve`,
      tokens.VER,
    ),
    422,
  );
  t(
    "POST /verify/:id/reject (SUP)",
    await probe(
      "POST",
      `/api/verification/orders/${probeOrder.id}/reject`,
      tokens.SUP,
      { rejectionNote: "x" },
    ),
    403,
  );
  t(
    "POST /verify/:id/reject (blank reason)",
    await probe(
      "POST",
      `/api/verification/orders/${probeOrder.id}/reject`,
      tokens.VER,
      { rejectionNote: "   " },
    ),
    422,
  );

  console.log(
    "\n── SEWING QUEUE (sewing_supervisor only) ────────────────────────",
  );
  t(
    "GET /api/sewing/queue (SEW)",
    await probe("GET", "/api/sewing/queue", tokens.SEW),
    200,
  );
  t(
    "GET /api/sewing/queue (SUP)",
    await probe("GET", "/api/sewing/queue", tokens.SUP),
    403,
  );
  t(
    "GET /api/sewing/queue (VER)",
    await probe("GET", "/api/sewing/queue", tokens.VER),
    403,
  );
  t(
    "GET /api/sewing/queue/:id (SEW, pending → 404)",
    await probe("GET", `/api/sewing/queue/${probeOrder.id}`, tokens.SEW),
    404,
  );
  t(
    "POST /api/sewing/queue/:id/start (SEW, pending → 404)",
    await probe("POST", `/api/sewing/queue/${probeOrder.id}/start`, tokens.SEW),
    404,
  );
  t(
    "POST /api/sewing/queue/:id/start (SUP)",
    await probe("POST", "/api/sewing/queue/1/start", tokens.SUP),
    403,
  );

  console.log(
    "\n── MALFORMED INPUT / DEFENSIVE ──────────────────────────────────",
  );
  const badJson = await fetch(`${API}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokens.SUP}`,
    },
    body: "{not json",
  });
  t("POST /api/orders (broken JSON)", badJson.status, 400);

  console.log(`\n════════════════════════════════════════════`);
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  console.log(`════════════════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Probe crashed:", err);
  process.exit(1);
});
