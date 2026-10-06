import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { evaluateComponentStatus } from "@apparelflow/shared";
import { db } from "../db/client";
import { verificationItems } from "../db/schema";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

const updateSchema = z.object({
  // Integer, non-negative. Upper bound matches the target-qty ceiling times
  // the maximum pieces-per-garment from any seeded recipe, with headroom.
  actualQty: z.number().int().nonnegative().max(10_000_000),
});

/**
 * PUT /api/verification-items/:id
 *
 * Records the verifier's physical count for one component. Recomputes the
 * traffic-light status from expected vs actual, server-side. The client never
 * dictates status.
 *
 * Only permitted while the parent order is PENDING_VERIFICATION — once a
 * decision has been made, the item rows are frozen.
 */
router.put(
  "/:id",
  asyncHandler(requireAuth),
  requireRole("cutting_verifier"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid verification item id" });
      return;
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid count payload",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const item = await db.query.verificationItems.findFirst({
      where: eq(verificationItems.id, id),
      with: { order: true },
    });

    if (!item) {
      res.status(404).json({ error: "Verification item not found" });
      return;
    }

    if (item.order.status !== "PENDING_VERIFICATION") {
      res.status(409).json({
        error: `Order is ${item.order.status} — counts can no longer be edited`,
      });
      return;
    }

    // Recompute traffic light from the authoritative pair. Do not trust any
    // client-supplied status — the client cannot see or set this field.
    const status = evaluateComponentStatus(
      parsed.data.actualQty,
      item.expectedQty,
    );

    const [updated] = await db
      .update(verificationItems)
      .set({ actualQty: parsed.data.actualQty, status })
      .where(eq(verificationItems.id, id))
      .returning();

    if (!updated) {
      res.status(500).json({ error: "Failed to update verification item" });
      return;
    }

    res.json({ item: updated });
  }),
);

export default router;
