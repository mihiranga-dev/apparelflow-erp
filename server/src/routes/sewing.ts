import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { cuttingOrders, verificationLogs } from "../db/schema";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Entire router is sewing-supervisor-only. Applied once so no handler can
// accidentally bypass the check.
router.use(asyncHandler(requireAuth));
router.use(requireRole("sewing_supervisor"));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sewing/queue
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/queue",
  asyncHandler(async (_req, res) => {
    // WHERE status = 'VERIFIED' enforced at the DB layer. A sewing supervisor
    // cannot leak pending or rejected orders by tampering with any parameter —
    // there is no parameter to tamper with.
    const orders = await db.query.cuttingOrders.findMany({
      where: eq(cuttingOrders.status, "VERIFIED"),
      with: {
        recipe: { with: { components: true } },
      },
      orderBy: [desc(cuttingOrders.updatedAt)],
    });

    // For each order, pull the latest APPROVED log so the list can show
    // verifier attribution inline. Filtering by decision='APPROVED' guards
    // against any historical rejection log for the same order id.
    const enriched = await Promise.all(
      orders.map(async (order) => {
        const [log] = await db
          .select({
            verifierName: verificationLogs.verifierId, // resolved below
            createdAt: verificationLogs.createdAt,
            wastagePct: verificationLogs.wastagePct,
            verifierId: verificationLogs.verifierId,
          })
          .from(verificationLogs)
          .where(
            and(
              eq(verificationLogs.orderId, order.id),
              eq(verificationLogs.decision, "APPROVED"),
            ),
          )
          .orderBy(desc(verificationLogs.createdAt))
          .limit(1);

        return {
          ...order,
          verifierName: null as string | null, // filled by the join below
          verifierId: log?.verifierId ?? null,
          verifiedAt: log?.createdAt ? log.createdAt.toISOString() : null,
          wastagePct: log?.wastagePct ?? null,
        };
      }),
    );

    // Resolve verifier names in a second pass so the primary query stays simple.
    const enrichedWithNames = await Promise.all(
      enriched.map(async (row) => {
        if (row.verifierId === null) {
          return { ...row, verifierName: null };
        }
        const [u] = await db.query.users.findMany({
          where: (fields, { eq: eqOp }) =>
            eqOp(fields.id, row.verifierId as number),
          columns: { fullName: true },
          limit: 1,
        });
        return { ...row, verifierName: u?.fullName ?? null };
      }),
    );

    res.json({ orders: enrichedWithNames });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sewing/queue/:id
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/queue/:id",
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
          orderBy: [desc(verificationLogs.createdAt)],
        },
      },
    });

    // Same visibility rule as the list: only VERIFIED. Return 404, not 403,
    // so we do not confirm the existence of batches outside the sewing scope.
    if (!order || order.status !== "VERIFIED") {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Attach component name to each verification item for the UI.
    const componentNameById = new Map(
      order.recipe.components.map((c) => [c.id, c.componentName]),
    );

    const shaped = {
      ...order,
      verificationItems: order.verificationItems.map((item) => ({
        ...item,
        componentName:
          componentNameById.get(item.componentId) ??
          `Component #${item.componentId}`,
      })),
      verificationLogs: order.verificationLogs.map((log) => ({
        ...log,
        verifierName: log.verifier?.fullName ?? null,
      })),
    };

    res.json({ order: shaped });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sewing/queue/:id/start
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/queue/:id/start",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }

    const sewingSupervisorId = req.user!.id;

    const order = await db.query.cuttingOrders.findFirst({
      where: eq(cuttingOrders.id, id),
    });

    if (!order || order.status !== "VERIFIED") {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Idempotency guard: re-clicking start on an already-started batch returns
    // the current state rather than silently overwriting the original actor
    // and timestamp. Preserves the audit trail's first-touch semantics.
    if (order.sewingStartedAt !== null) {
      res.status(409).json({
        error: "Sewing has already been started for this batch",
        sewingStartedAt: order.sewingStartedAt,
      });
      return;
    }

    const [updated] = await db
      .update(cuttingOrders)
      .set({
        sewingStartedAt: new Date(),
        sewingStartedBy: sewingSupervisorId, // FROM SESSION — never from body
        updatedAt: new Date(),
      })
      .where(
        and(eq(cuttingOrders.id, id), eq(cuttingOrders.status, "VERIFIED")),
      )
      .returning();

    if (!updated) {
      // Race: batch status changed between our read and our write. Retried by
      // the client, which will hit the 404 or 409 branch on the next call.
      res
        .status(409)
        .json({ error: "Batch state changed — refresh and try again" });
      return;
    }

    res.json({ order: updated });
  }),
);

export default router;
