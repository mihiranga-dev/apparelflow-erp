import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { cuttingOrders } from "../db/schema";
import { eq } from "drizzle-orm";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  approveOrder,
  rejectOrder,
  OrderStateError,
} from "../services/verification";

const router = Router();

// Every route in this file is verifier-only. requireRole is applied once at
// the router level so no handler can accidentally skip it.
router.use(asyncHandler(requireAuth));
router.use(requireRole("cutting_verifier"));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verification/orders/:id/approve
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/orders/:id/approve",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }

    // Identity comes from the authenticated session — never from req.body.
    // See `req.user` population in requireAuth.
    const verifierId = req.user!.id;

    try {
      const result = await approveOrder({ orderId: id, verifierId });

      if (!result.ok) {
        res.status(422).json({
          error: result.message,
          code: result.code,
          details: { componentNames: result.offendingComponentNames },
        });
        return;
      }

      // Re-read the order to return the fresh VERIFIED status to the client.
      const [order] = await db
        .select()
        .from(cuttingOrders)
        .where(eq(cuttingOrders.id, id))
        .limit(1);

      res.json({
        order,
        wastagePct: result.wastagePct,
        logId: result.logId,
      });
    } catch (err) {
      if (err instanceof OrderStateError) {
        if (err.code === "NOT_FOUND") {
          res.status(404).json({ error: err.message });
          return;
        }
        if (err.code === "WRONG_STATUS") {
          res.status(409).json({ error: err.message });
          return;
        }
      }
      throw err;
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verification/orders/:id/reject
// ─────────────────────────────────────────────────────────────────────────────

const rejectSchema = z.object({
  // Non-empty after trim. Enforced again inside the service — belt and braces.
  rejectionNote: z
    .string()
    .trim()
    .min(1, "Rejection reason is required")
    .max(2000),
});

router.post(
  "/orders/:id/reject",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }

    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: "Rejection reason is mandatory",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const verifierId = req.user!.id;

    try {
      const result = await rejectOrder({
        orderId: id,
        verifierId,
        rejectionNote: parsed.data.rejectionNote,
      });

      const [order] = await db
        .select()
        .from(cuttingOrders)
        .where(eq(cuttingOrders.id, id))
        .limit(1);

      res.json({
        order,
        wastagePct: result.wastagePct,
        logId: result.logId,
      });
    } catch (err) {
      if (err instanceof OrderStateError) {
        if (err.code === "NOT_FOUND") {
          res.status(404).json({ error: err.message });
          return;
        }
        if (err.code === "WRONG_STATUS") {
          res.status(409).json({ error: err.message });
          return;
        }
        if (err.code === "EMPTY_REASON") {
          res.status(422).json({ error: err.message });
          return;
        }
      }
      throw err;
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verification/orders/:id  — full terminal payload
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }

    const order = await db.query.cuttingOrders.findFirst({
      where: eq(cuttingOrders.id, id),
      with: {
        recipe: { with: { components: true } },
        verificationItems: true,
        verificationLogs: {
          with: { verifier: { columns: { id: true, fullName: true } } },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Verifiers only see orders in PENDING_VERIFICATION. Once decided, the
    // batch leaves their workspace. Prevents a verifier from re-reading an
    // approved order and being tempted to "adjust" data.
    if (order.status !== "PENDING_VERIFICATION") {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Shape the logs for the DTO — flatten verifier name into the row.
    const shaped = {
      ...order,
      verificationLogs: order.verificationLogs.map((log) => ({
        ...log,
        verifierName: log.verifier?.fullName ?? null,
      })),
    };

    res.json({ order: shaped });
  }),
);

export default router;
