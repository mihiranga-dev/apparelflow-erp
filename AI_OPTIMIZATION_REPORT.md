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

### 2. Flawed/Broken AI Code

- **Tailwind v3/v4 tooling missmatch:** Deepseek provided outdated setup instructions to install Tailwind CSS v3. However, when initializing Shadcn UI, it automaticaly generated modern v4 CSS variables. This causing the application to crash with a compile time error stating that the color 'border-border' did not exist.
- **Drizzle Schema Error:** AI-generated schema used numeric(..., { mode: "number" }). But that does not exist in the drizzle-orm version that i used for this project.
- **JWT sub type violation:** In code JWT playload declared sub:number and that violates jsonwebtoken's JwtPlayload.sub : string | undefined.
- **Implicit Role Fallback (RBAC Vulnerability):** In the GET /api/orders endpoint, AI correctly scoped queries for the 'cutting_supervisor' and 'cutting_verifier' roles using explicit if statements. However, it left the 'sewing_supervisor' logic as an implicit fallback at the bottom of the function. This created a structural vulnerability- if a fourth role were ever added to the system in the future, it would automatically bypass the first two checks and execute the sewing queue query, leaking verified orders to an unauthorized role.

### 3. Human Refactoring

- **Manual Tailwind v4 Upgrade:** Instead of asking the AI to fix the broken CSS, I manually remove the outdated v3 configuration and upgraded the entire project to Tailwind v4 stack.
- **Manually change to doublePrecision:** After verifying that upgrading drizzle is not the fix, replaced numeric with doublePrecision for all measurement columns.
- Correctly typed sub: string, added an explicit String(user.id) coercion at sign-time, and a parseSubject() helper at verify-time that validates the string is a positive integer before any DB lookup.
- **Explicit Role Validation & Default-Deny:** I manually refactored the AI's implicit fallback by wrapping the sewing queue query in an explicit if (user.role === "sewing_supervisor") condition. To secure the endpoint against future role expansions, I added a strict Default Deny termination at the end of the route that returns a 403 Forbidden error for any unhandled roles.

### 4. Defensive Architecture

- **Timing Attack Prevention:** During the login authentication flow, implemented a dummy `bcrypt` hash comparison. This ensures the Express server always executes a compute-heavy bcrypt check even if the requested email does not exist in the database. This equalizes response times across all code paths, preventing attackers from enumerating valid user emails via timing analysis.
- **CPU Exhaustion Prevention (DoS Guard):** AI-generated auth flows often blindly hash any input. Because bcrypt processing time scales with input length, implemented strict Zod schema validation (`max(72)`) on the password payload. This protects the Node.js event loop from locking up if a malicious user submits a 100,000-character string.
- **Server Enforced RBAC & Hard Stops:** Frontend UI validation (like disabling buttons) was treated purely as user experience. I engineered strict server-side middleware that independently verifies the JWT signature and the assigned database role. I validated these boundaries independently of the React client using raw `curl` scripts, proving that injecting a "bogus" token or attempting to bypass the UI results in an un-bypassable `401 Unauthorized` or `422 Unprocessable Entity` response at the network level.
