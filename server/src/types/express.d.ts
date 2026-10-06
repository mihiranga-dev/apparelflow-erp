import type { AuthUser } from "@apparelflow/shared";

/**
 * Augments Express's Request type with `user`, populated by the auth
 * middleware after JWT verification. Declared globally so every route
 * handler gets typed access to `req.user` without casts.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
