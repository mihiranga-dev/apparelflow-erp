import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { expectedComponentQty } from "@apparelflow/shared";
import { db } from "../db/client";
import { cuttingOrders, recipes, verificationItems } from "../db/schema";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  recipeId: z.number().int().positive(),
  // Upper bound is a sanity ceiling — a factory batch above 100k garments is
  // almost certainly a typo or an attack, not a real order.
  targetQty: z.number().int().positive().max(100_000),
  fabricRollId: z.string().trim().min(1).max(64),
  actualFabricYds: z
    .number()
    .finite()
    .positive()
    .max(1_000_000)
    // Reject anything beyond 2 decimal places. Tolerance handles float
    // representation error (e.g. 95.55 * 100 === 9554.999...).
    .refine((n) => {
      const scaled = n * 100;
      return Math.abs(scaled - Math.round(scaled)) < 1e-6;
    }, "At most 2 decimal places allowed"),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders  — role-scoped read
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/",
  asyncHandler(requireAuth),
  asyncHandler(async (req, res) => {
    const user = req.user!;

    // Role-scoped query isolation. Each persona issues a DIFFERENT SQL query —
    // the filter is not applied after the fact, it's part of the WHERE clause.
    // A sewing supervisor cannot leak pending orders by tampering with params,
    // because there are no params to tamper with.
    if (user.role === "cutting_supervisor") {
      const rows = await db.query.cuttingOrders.findMany({
        where: eq(cuttingOrders.createdBy, user.id),
        with: { recipe: true },
        orderBy: [desc(cuttingOrders.createdAt)],
      });
      res.json({ orders: rows });
      return;
    }

    if (user.role === "cutting_verifier") {
      const rows = await db.query.cuttingOrders.findMany({
        where: eq(cuttingOrders.status, "PENDING_VERIFICATION"),
        with: { recipe: true },
        orderBy: [asc(cuttingOrders.createdAt)],
      });
      res.json({ orders: rows });
      return;
    }

    // sewing_supervisor
    const rows = await db.query.cuttingOrders.findMany({
      where: eq(cuttingOrders.status, "VERIFIED"),
      with: { recipe: true },
      orderBy: [desc(cuttingOrders.createdAt)],
    });
    res.json({ orders: rows });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id  — single order with recipe + items
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/:id",
  asyncHandler(requireAuth),
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
        verificationLogs: true,
      },
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Same visibility rules as the list endpoint, applied to a single row.
    const user = req.user!;
    const visible =
      (user.role === "cutting_supervisor" && order.createdBy === user.id) ||
      (user.role === "cutting_verifier" &&
        order.status === "PENDING_VERIFICATION") ||
      (user.role === "sewing_supervisor" && order.status === "VERIFIED");

    if (!visible) {
      // 404 not 403 — don't confirm the order exists to a role that has
      // no business knowing about it.
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.json({ order });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders  — create + run the multiplier engine
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/",
  asyncHandler(requireAuth),
  requireRole("cutting_supervisor"),
  asyncHandler(async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid order payload",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { recipeId, targetQty, fabricRollId, actualFabricYds } = parsed.data;

    // Load recipe + its component list before opening a transaction — a bad
    // recipe should fail fast without reserving a DB connection.
    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, recipeId),
      with: { components: true },
    });

    if (!recipe) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    if (recipe.components.length === 0) {
      // Defensive: a recipe without components cannot produce a verifiable
      // batch, so creating an order against it would silently leak through
      // the gatekeeper with nothing to check.
      res
        .status(422)
        .json({ error: "Recipe has no components — cannot create order" });
      return;
    }

    const year = new Date().getFullYear();

    // Transaction: order row + all verification item rows succeed together or
    // fail together. A partial write here would produce an order that can
    // never be approved (missing component rows) — a dead batch stuck in QC.
    const order = await db.transaction(async (tx) => {
      // Two-step order number generation. Inserting with a temporary UUID
      // (guaranteed unique) then updating to CO-YYYY-NNNN from the serial id
      // avoids the COUNT(*)+1 race condition entirely — the serial id is
      // monotonic and unique by construction.
      const [inserted] = await tx
        .insert(cuttingOrders)
        .values({
          orderNo: `TMP-${randomUUID()}`,
          recipeId,
          targetQty,
          fabricRollId,
          actualFabricYds,
          // Submitting the form IS the transition to QC. Matches the spec:
          // "Order Submission: Submitting transitions the order to PENDING_VERIFICATION."
          status: "PENDING_VERIFICATION",
          createdBy: req.user!.id,
        })
        .returning();

      if (!inserted) throw new Error("Failed to insert cutting order");

      const orderNo = `CO-${year}-${String(inserted.id).padStart(4, "0")}`;

      const [finalized] = await tx
        .update(cuttingOrders)
        .set({ orderNo, updatedAt: new Date() })
        .where(eq(cuttingOrders.id, inserted.id))
        .returning();

      if (!finalized) throw new Error("Failed to finalize order number");

      // ─── MULTIPLIER ENGINE ────────────────────────────────────────────────
      // Snapshot expected quantities NOW. If the recipe is ever edited, this
      // batch's requirements must remain the ones agreed at creation time.
      await tx.insert(verificationItems).values(
        recipe.components.map((component) => ({
          orderId: finalized.id,
          componentId: component.id,
          expectedQty: expectedComponentQty(
            targetQty,
            component.piecesPerGarment,
          ),
          actualQty: null,
          status: null,
        })),
      );

      return finalized;
    });

    res.status(201).json({ order });
  }),
);

export default router;
