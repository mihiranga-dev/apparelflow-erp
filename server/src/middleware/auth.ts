import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import type { AuthUser, UserRole } from "@apparelflow/shared";
import { db } from "../db/client";
import { users } from "../db/schema";
import { parseSubject, verifyToken } from "../lib/jwt";

/**
 * Verifies the Bearer token, then re-reads the user from the DB.
 *
 * Why re-read: a token carries the role claim at issue-time. If an admin
 * later changes a user's role, the stale token must not retain elevated
 * privileges. The DB lookup is a single indexed primary-key read on every
 * request — negligible cost for a materially stronger guarantee.
 *
 * Failure mode: 401 Unauthorized (missing/invalid/expired).
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Parse the string sub back to numeric id. A tampered token with a
  // non-numeric sub dies here — never reaches the DB.
  const userId = parseSubject(payload.sub);
  if (userId === null) {
    res.status(401).json({ error: "Invalid token subject" });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "Authenticated user no longer exists" });
    return;
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
  req.user = authUser;
  next();
}

/**
 * Authorization gate. Must run AFTER `requireAuth` so `req.user` is populated.
 * Failure mode: 403 Forbidden (this is the RBAC hard boundary the spec
 * insists on — a cutting_supervisor POSTing to /verify MUST land here).
 */
export function requireRole(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({
        error: "Forbidden: your role is not permitted to perform this action",
        requiredRoles: allowed,
        yourRole: req.user.role,
      });
      return;
    }
    next();
  };
}
