import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async route handler and forwards any rejected promise to Express's
 * global error handler. Without this, unhandled async errors leave the
 * request hanging until the client times out.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
