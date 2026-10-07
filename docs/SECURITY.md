# Security & RBAC Model

ApparelFlow enforces its production gates **server-side**. Every UI state below is mirrored by a server guard; hiding a button is never the security boundary.

## Roles

| Role                 | Can                                                            | Cannot                                                               |
| -------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `cutting_supervisor` | Create cutting orders · view own orders · view recipes         | Verify · access sewing queue · see other supervisors' orders         |
| `cutting_verifier`   | Enter component counts · approve / reject batches              | Create orders · view sewing queue · edit counts after decision       |
| `sewing_supervisor`  | View VERIFIED batches only · start assembly · view audit trail | See unverified / pending / rejected batches · verify · create orders |

## Endpoint Guard Matrix

Every protected endpoint's enforcement, verifiable via `node scripts/rbac-probe.mjs`:

| Endpoint                                    | Auth | Role                 | Business Rule                                                | Failure Codes         |
| ------------------------------------------- | ---- | -------------------- | ------------------------------------------------------------ | --------------------- |
| `POST /auth/login`                          | —    | —                    | Credential check · rate-limited                              | 401 · 429             |
| `POST /auth/switch-role`                    | ✓    | any                  | Target role must exist                                       | 400 · 404             |
| `GET /auth/me`                              | ✓    | any                  | —                                                            | 401                   |
| `GET /api/recipes`                          | ✓    | any                  | —                                                            | 401                   |
| `GET /api/orders`                           | ✓    | any                  | **Role-scoped WHERE**: each role gets a different query      | 401                   |
| `GET /api/orders/:id`                       | ✓    | any                  | Per-row visibility; **404 not 403** for cross-role           | 401 · 404             |
| `POST /api/orders`                          | ✓    | `cutting_supervisor` | Zod body validation · multiplier engine in transaction       | 400 · 403 · 404 · 422 |
| `PUT /api/verification-items/:id`           | ✓    | `cutting_verifier`   | Status recomputed server-side · parent order must be PENDING | 400 · 403 · 404 · 409 |
| `GET /api/verification/orders/:id`          | ✓    | `cutting_verifier`   | Order must be PENDING_VERIFICATION                           | 401 · 403 · 404       |
| `POST /api/verification/orders/:id/approve` | ✓    | `cutting_verifier`   | **HARD STOP**: no missing, uncounted, or RED items           | 403 · 409 · 422       |
| `POST /api/verification/orders/:id/reject`  | ✓    | `cutting_verifier`   | Non-empty reason note · order must be PENDING                | 403 · 409 · 422       |
| `GET /api/sewing/queue`                     | ✓    | `sewing_supervisor`  | **WHERE status = 'VERIFIED'** at query layer                 | 401 · 403             |
| `GET /api/sewing/queue/:id`                 | ✓    | `sewing_supervisor`  | 404 for non-VERIFIED                                         | 401 · 403 · 404       |
| `POST /api/sewing/queue/:id/start`          | ✓    | `sewing_supervisor`  | Idempotency: 409 if already started                          | 401 · 403 · 404 · 409 |

## The Four Hard Guarantees

1. **Server-side RBAC.** Every role check runs as Express middleware. A `cutting_supervisor` POSTing directly to `/approve` receives **403 Forbidden** — the frontend hiding buttons is UI affordance, not enforcement.

2. **The gatekeeper hard stop.** `/approve` rejects with **422 Unprocessable Entity** if any verification item is missing, uncounted, or flagged RED. The check recomputes traffic lights from `expectedQty` and `actualQty` rather than trusting the stored `status` column, defending against any path that could leave a stale value (manual SQL, migration bug, future alternate write endpoint).

3. **Query isolation.** The sewing queue issues `SELECT ... WHERE status = 'VERIFIED'` as a SQL predicate, not a post-fetch filter. There are no query parameters that could relax this — the endpoint accepts none.

4. **Session-derived identity.** Verifier attribution (`verifier_id`) and sewing-supervisor attribution (`sewing_started_by`) are read from `req.user!.id`, populated by the auth middleware from a verified JWT. Client-supplied `verifierId`/`sewingStartedBy` values in request bodies are never read.

## Tamper Resistance

| Attack                                         | Result                                                          |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Strip / modify JWT signature                   | 401 — HMAC verification fails                                   |
| Swap JWT payload, keep original signature      | 401 — signature doesn't match modified payload                  |
| Supply different role in request body          | Ignored — role comes from JWT, re-read from DB on every request |
| Supply `verifierId` in approval body           | Ignored — server uses `req.user.id`                             |
| Bypass UI and POST to `/approve` as supervisor | 403 — `requireRole('cutting_verifier')` middleware              |
| Edit verification item on a decided order      | 409 — parent order must be `PENDING_VERIFICATION`               |
| Start sewing on a non-VERIFIED batch           | 404 — query filters by `status = 'VERIFIED'`                    |
| Replay a full valid approval request           | 409 — order no longer `PENDING_VERIFICATION`                    |

## Verification Command

```bash
node scripts/rbac-probe.mjs
```
