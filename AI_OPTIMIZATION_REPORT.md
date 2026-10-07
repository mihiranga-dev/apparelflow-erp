# AI Optimization & Engineering Report

**Name:** Mihiranga Dissanayake
**Project:** ApparelFlow ERP - Cutting Verification Gate
**Role:** Software Engineering Intern

This document outlines the AI-assisted development workflow used during this 4-day sprint. My core philosophy is that AI accelerates code generation, but structural integrity and security boundaries must be strictly engineered and audited by a human developer.

---

### 1. Tools & Prompting

- **Primary AI Model:** DeepSeek V4.1 Flash
- **Environment:** Chatbox
- **Prompting Strategy:**
  - Used AI primarily for coding React components, coding business logics that used in the system, generating Tailwind CSS boilerplate, and drafting the initial SQL schema for the required tables.
- **shadcn/ui CLI (`npx shadcn@latest`):** UI component generation.
- **Drizzle Kit CLI:** Schema - migration generation

### 2. Flawed/Broken AI Code

- **Tailwind v3/v4 tooling missmatch:** Deepseek provided outdated setup instructions to install Tailwind CSS v3. However, when initializing Shadcn UI, it automaticaly generated modern v4 CSS variables. This causing the application to crash with a compile time error stating that the color 'border-border' did not exist.
- **Drizzle Schema Error:** AI-generated schema used numeric(..., { mode: "number" }). But that does not exist in the drizzle-orm version that i used for this project.
- **JWT sub type violation:** In code JWT playload declared sub:number and that violates jsonwebtoken's JwtPlayload.sub : string | undefined.
- **Implicit Role Fallback (RBAC Vulnerability):** In the GET /api/orders endpoint, AI correctly scoped queries for the 'cutting_supervisor' and 'cutting_verifier' roles using explicit if statements. However, it left the 'sewing_supervisor' logic as an implicit fallback at the bottom of the function. This created a structural vulnerability- if a fourth role were ever added to the system in the future, it would automatically bypass the first two checks and execute the sewing queue query, leaking verified orders to an unauthorized role.
- Correcting a form field did not clear its error until the next submit. Introduced `validateField(field, value, recipes)` — a pure function shared by per-field clear-on-change and submit-time validation, guaranteeing rule parity.
- **Client approval gate ignored unsaved edits:** A verifier could clear a component's count input, leaving the field empty, and the bottom bar still read "All components verified".

### 3. Human Refactoring

- **Manual Tailwind v4 Upgrade:** Instead of asking the AI to fix the broken CSS, I manually remove the outdated v3 configuration and upgraded the entire project to Tailwind v4 stack.
- **Manually change to doublePrecision:** After verifying that upgrading drizzle is not the fix, replaced numeric with doublePrecision for all measurement columns.
- Correctly typed sub: string, added an explicit String(user.id) coercion at sign-time, and a parseSubject() helper at verify-time that validates the string is a positive integer before any DB lookup.
- **Explicit Role Validation & Default-Deny:** I manually refactored the AI's implicit fallback by wrapping the sewing queue query in an explicit if (user.role === "sewing_supervisor") condition. To secure the endpoint against future role expansions, I added a strict Default Deny termination at the end of the route that returns a 403 Forbidden error for any unhandled roles.

### 4. Defensive Architecture

- **Timing Attack Prevention:** During the login authentication flow, implemented a dummy `bcrypt` hash comparison. This ensures the Express server always executes a compute-heavy bcrypt check even if the requested email does not exist in the database. This equalizes response times across all code paths, preventing attackers from enumerating valid user emails via timing analysis.
- **CPU Exhaustion Prevention (DoS Guard):** AI-generated auth flows often blindly hash any input. Because bcrypt processing time scales with input length, implemented strict Zod schema validation (`max(72)`) on the password payload. This protects the Node.js event loop from locking up if a malicious user submits a 100,000-character string.
- **Server Enforced RBAC & Hard Stops:** Frontend UI validation (like disabling buttons) was treated purely as user experience. I engineered strict server-side middleware that independently verifies the JWT signature and the assigned database role. I validated these boundaries independently of the React client using raw `curl` scripts, proving that injecting a "bogus" token or attempting to bypass the UI results in an un-bypassable `401 Unauthorized` or `422 Unprocessable Entity` response at the network level.

## 4. Defensive Architecture

### The state machine

```
CUTTING_IN_PROGRESS ──[order submitted]──► PENDING_VERIFICATION
                                                 │
                          ┌──────────────────────┼──────────────────────┐
                          │                      │                      │
                    [all GREEN/YELLOW]     [any RED or uncounted]  [verifier rejects]
                          │                      │                      │
                          ▼                      ▼                      ▼
                      VERIFIED            (blocked — 422)         REJECTED
                          │                                            │
                  [sewing supervisor                           [supervisor re-cuts]
                   starts assembly]
                          │
                          ▼
                 sewing_started_at set
                 (status remains VERIFIED)
```

**Invariants:**

- `VERIFIED` is one-way. There is no API path that transitions out of it.
- The audit log row is written in the same **transaction** as the status flip. A partial write cannot produce a VERIFIED order without a log row.
- `REJECTED` requires a non-empty reason note, enforced by Zod at the router and again in the service layer.
- "Start sewing" is a persisted timestamp, not a status change — it keeps the state machine at four states and doesn't ripple into Phase 4's guards.

### The four API guards

Every protected endpoint passes through this chain. Failure codes are what the evaluator's `rbac-probe.mjs` asserts against.

**Guard 1 — `requireAuth` (401).** Reads the `Authorization: Bearer` header, verifies the JWT signature, then
**re-reads the user from the database on every request**. The role claim in the token is never trusted for authorization decisions — a stale token cannot retain a revoked role. The DB re-read is a single indexed primary-key lookup.

**Guard 2 — `requireRole(...)` (403).**
A middleware factory applied at either the router level (sewing, verification) or the route level (order creation). A `cutting_supervisor` POSTing directly to `/api/verification/orders/:id/approve` hits this and receives:

```
{ "error": "Forbidden: your role is not permitted to perform this action",
  "requiredRoles": ["cutting_verifier"],
  "yourRole": "cutting_supervisor" }
```

**Guard 3 — Zod body validation (400).** Every endpoint that accepts a body validates shape, type, and range before any business logic runs. Targets the exact failure modes the assessment calls out: negative numbers, decimals where integers are required, empty strings, non-numeric values, malformed JSON.

**Guard 4 — The gatekeeper (422).** `evaluateApproval` runs inside the approval transaction. It rejects with the earliest applicable condition:

```
| Condition                                       | Code              | Message                                                                |
|-------------------------------------------------|-------------------|------------------------------------------------------------------------|
| Verification row count ≠ recipe component count | `MISSING_ITEMS`   | "Batch is missing verification rows…"                                  |
| Any `actualQty IS NULL`                         | `UNCOUNTED_ITEMS` | "N component(s) have not been counted yet."                            |
| Any recomputed status is RED                    | `SHORTAGE`        | "N component(s) have a shortage. Batch cannot enter the sewing queue." |
```

The shortage check recomputes status from `expectedQty`/`actualQty` — the persisted `status` column is never read.

### Verification command

```
API_BASE=https://apparelflow-erp.netlify.app node scripts/rbac-probe.mjs
```
