import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  USER_ROLES,
  type AuthUser,
  type AuthResponse,
} from "@apparelflow/shared";
import { db } from "../db/client";
import { users } from "../db/schema";
import { signToken } from "../lib/jwt";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../middleware/auth";
import rateLimit from "express-rate-limit";

// Login rate limit. 20 attempts per 15 minutes per IP.

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Only count failures. Successful logins don't consume the budget, so a
  // heavy-handed session doesn't lock out a legitimate user mid-audit.
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Try again in a few minutes." },
});

const router = Router();

/**
 * Pre-computed bcrypt hash, used as a dummy when the email does not match any
 * user. This keeps `bcrypt.compare` running in every code path so response
 * timing does not leak whether an email exists (user-enumeration guard).
 */
const DUMMY_BCRYPT_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(72, "Password is too long"),
});

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid login payload",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always compare — even when user is undefined — to equalize timing.
    const hashToCheck = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
    const passwordOk = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordOk) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
    const body: AuthResponse = { token: signToken(authUser), user: authUser };
    res.json(body);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/switch-role   (evaluator demo convenience)
// ─────────────────────────────────────────────────────────────────────────────

const switchRoleSchema = z.object({
  role: z.enum(USER_ROLES),
});

router.post(
  "/switch-role",
  asyncHandler(requireAuth),
  asyncHandler(async (req, res) => {
    const parsed = switchRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Unknown role",
        allowedRoles: USER_ROLES,
      });
      return;
    }

    // Every role maps to its own canonical demo user row, so audit logs keep
    // real FK integrity (a verifier decision is attributed to a verifier row,
    // never to a supervisor temporarily "wearing" the verifier role).
    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.role, parsed.data.role))
      .limit(1);

    if (!target) {
      res
        .status(404)
        .json({ error: `No seeded user for role "${parsed.data.role}"` });
      return;
    }

    const authUser: AuthUser = {
      id: target.id,
      email: target.email,
      fullName: target.fullName,
      role: target.role,
    };

    console.log(
      `[AUTH] User switched role context to: ${authUser.role} (${authUser.email})`,
    );

    const body: AuthResponse = { token: signToken(authUser), user: authUser };
    res.json(body);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/me
// ─────────────────────────────────────────────────────────────────────────────

router.get("/me", asyncHandler(requireAuth), (req, res) => {
  // requireAuth guarantees req.user is set.
  res.json({ user: req.user });
});

export default router;
