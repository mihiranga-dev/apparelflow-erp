import jwt, {
  type SignOptions,
  type JwtPayload as BaseJwtPayload,
} from "jsonwebtoken";
import type { AuthUser, UserRole } from "@apparelflow/shared";
import { env } from "../config/env";

/**
 * The JWT payload carries everything the middleware needs to identify the
 * caller without a DB round-trip on every request. Note: `role` is re-read
 * from the DB in `requireAuth` anyway, so a stale token cannot be used to
 * retain a role the server has since revoked.
 */
export interface AuthTokenPayload extends BaseJwtPayload {
  sub: string; // JWT spec- sub is always a string
  email: string;
  fullName: string;
  role: UserRole;
}

export function signToken(user: AuthUser): string {
  const payload: Omit<AuthTokenPayload, "iat" | "exp"> = {
    sub: String(user.id), // coerce numeric id - JWT-mandated string
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
  const opts: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.JWT_SECRET, opts);
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === "string") return null;
    return decoded as AuthTokenPayload;
  } catch {
    // Any tampering, expiry, or malformed token lands here.
    return null;
  }
}

/**
 * Parses the JWT `sub` back into our numeric user id. Throws nothing —
 * returns null on any non-numeric, non-positive, or non-integer value,
 * so callers can uniformly reject with 401.
 */
export function parseSubject(sub: string): number | null {
  const n = Number(sub);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}
