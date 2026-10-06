import { eq } from "drizzle-orm";
import {
  calculateWastagePct,
  hasAnyShortage,
  type ApprovalBlockReason,
  type ComponentStatus,
} from "@apparelflow/shared";
import {
  cuttingOrders,
  recipes,
  verificationItems,
  verificationLogs,
} from "../db/schema";
import { db } from "../db/client";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// ─────────────────────────────────────────────────────────────────────────────
// Decision types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape of the pure decision function. Success arm carries only the wastage
 * — a value the decision layer can produce without any DB write.
 */
export type ApprovalDecision =
  | { ok: true; wastagePct: number }
  | {
      ok: false;
      code: ApprovalBlockReason;
      message: string;
      offendingComponentNames: string[];
    };

/**
 * Shape of the transactional approve operation. Success arm adds `logId`,
 * which only exists after the audit-log INSERT. Kept as a distinct union from
 * ApprovalDecision so TypeScript can narrow on `result.ok` and safely expose
 * `result.logId` in the success branch.
 */
export type ApproveOutcome =
  | { ok: true; wastagePct: number; logId: number }
  | {
      ok: false;
      code: ApprovalBlockReason;
      message: string;
      offendingComponentNames: string[];
    };

interface ApprovalContext {
  expectedComponentCount: number;
  items: Array<{
    id: number;
    componentId: number;
    expectedQty: number;
    actualQty: number | null;
    status: ComponentStatus | null;
  }>;
  componentNameById: Map<number, string>;
  actualFabricYds: number;
  targetQty: number;
  stdFabricYards: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure decision function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The gatekeeper rule, expressed once, testable in isolation.
 *
 * Rejects approval when ANY of:
 *   1. The number of verification item rows does not match the recipe's
 *      component count — a component is missing from the batch audit.
 *   2. Any item has a null actualQty — the verifier has not counted it yet.
 *   3. Any item is flagged RED — a physical shortage exists.
 *
 * Order of checks is deliberate: missing/uncounted are "state incomplete"
 * errors; RED is the real business failure. Earliest condition wins so the
 * client can guide the verifier to the next required action.
 */
export function evaluateApproval(ctx: ApprovalContext): ApprovalDecision {
  // 1. Structural check — every recipe component must have a verification row.
  if (ctx.items.length !== ctx.expectedComponentCount) {
    return {
      ok: false,
      code: "MISSING_ITEMS",
      message: `Batch is missing verification rows: expected ${ctx.expectedComponentCount}, found ${ctx.items.length}.`,
      offendingComponentNames: [],
    };
  }

  // 2. Uncounted items — a null actualQty means the row was never filled in.
  const uncounted = ctx.items.filter((i) => i.actualQty === null);
  if (uncounted.length > 0) {
    return {
      ok: false,
      code: "UNCOUNTED_ITEMS",
      message: `${uncounted.length} component(s) have not been counted yet.`,
      offendingComponentNames: uncounted.map(
        (i) =>
          ctx.componentNameById.get(i.componentId) ??
          `Component #${i.componentId}`,
      ),
    };
  }

  // 3. Shortage check — status is stored, but we do not blindly trust it.
  //    Recompute the traffic light here to defend against any path that may
  //    have left a stale `status` value (manual SQL, future bug, bad migration).
  const recomputedStatuses: ComponentStatus[] = ctx.items.map((i) => {
    if (i.actualQty === null) return "RED"; // unreachable after step 2
    if (i.actualQty === i.expectedQty) return "GREEN";
    if (i.actualQty > i.expectedQty) return "YELLOW";
    return "RED";
  });

  if (hasAnyShortage(recomputedStatuses)) {
    const offenders = ctx.items.filter(
      (_item, idx) => recomputedStatuses[idx] === "RED",
    );
    return {
      ok: false,
      code: "SHORTAGE",
      message: `${offenders.length} component(s) have a shortage. Batch cannot enter the sewing queue.`,
      offendingComponentNames: offenders.map(
        (i) =>
          ctx.componentNameById.get(i.componentId) ??
          `Component #${i.componentId}`,
      ),
    };
  }

  const expectedFabricYds = ctx.targetQty * ctx.stdFabricYards;
  const wastagePct = calculateWastagePct(
    ctx.actualFabricYds,
    expectedFabricYds,
  );

  return { ok: true, wastagePct };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactional approve
// ─────────────────────────────────────────────────────────────────────────────

export async function approveOrder(params: {
  orderId: number;
  verifierId: number;
}): Promise<ApproveOutcome> {
  const { orderId, verifierId } = params;

  return await db.transaction(async (tx) => {
    const loaded = await loadVerificationContext(tx, orderId);
    if (!loaded) {
      throw new OrderStateError("NOT_FOUND", "Order not found");
    }
    if (loaded.order.status !== "PENDING_VERIFICATION") {
      throw new OrderStateError(
        "WRONG_STATUS",
        `Order is in status ${loaded.order.status}, not PENDING_VERIFICATION`,
      );
    }

    const decision = evaluateApproval(loaded.ctx);
    if (!decision.ok) {
      // Widens to the ApproveOutcome failure arm — same shape, no logId.
      return decision;
    }

    const [log] = await tx
      .insert(verificationLogs)
      .values({
        orderId,
        verifierId, // FROM SESSION — never from the request body
        decision: "APPROVED",
        rejectionNote: null,
        wastagePct: decision.wastagePct,
      })
      .returning();

    if (!log) throw new Error("Failed to write verification log");

    await tx
      .update(cuttingOrders)
      .set({ status: "VERIFIED", updatedAt: new Date() })
      .where(eq(cuttingOrders.id, orderId));

    return { ok: true, wastagePct: decision.wastagePct, logId: log.id };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactional reject
// ─────────────────────────────────────────────────────────────────────────────

export interface RejectResult {
  wastagePct: number;
  logId: number;
}

export async function rejectOrder(params: {
  orderId: number;
  verifierId: number;
  rejectionNote: string;
}): Promise<RejectResult> {
  const { orderId, verifierId, rejectionNote } = params;

  const note = rejectionNote.trim();
  if (note.length === 0) {
    // Defense in depth — the router validates this too.
    throw new OrderStateError("EMPTY_REASON", "Rejection reason is mandatory");
  }

  return await db.transaction(async (tx) => {
    const loaded = await loadVerificationContext(tx, orderId);
    if (!loaded) throw new OrderStateError("NOT_FOUND", "Order not found");
    if (loaded.order.status !== "PENDING_VERIFICATION") {
      throw new OrderStateError(
        "WRONG_STATUS",
        `Order is in status ${loaded.order.status}, not PENDING_VERIFICATION`,
      );
    }

    // Wastage is still computed and stored on rejection for trend analysis.
    const expectedFabricYds =
      loaded.order.targetQty * loaded.ctx.stdFabricYards;
    const wastagePct = calculateWastagePct(
      loaded.order.actualFabricYds,
      expectedFabricYds,
    );

    const [log] = await tx
      .insert(verificationLogs)
      .values({
        orderId,
        verifierId,
        decision: "REJECTED",
        rejectionNote: note,
        wastagePct,
      })
      .returning();

    if (!log) throw new Error("Failed to write verification log");

    await tx
      .update(cuttingOrders)
      .set({ status: "REJECTED", updatedAt: new Date() })
      .where(eq(cuttingOrders.id, orderId));

    return { wastagePct, logId: log.id };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: state error + context loader
// ─────────────────────────────────────────────────────────────────────────────

export type OrderStateErrorCode = "NOT_FOUND" | "WRONG_STATUS" | "EMPTY_REASON";

export class OrderStateError extends Error {
  constructor(
    public readonly code: OrderStateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrderStateError";
  }
}

/**
 * Loads everything `evaluateApproval` and the transactional writers need, in
 * one place. Return type is inferred so we do not hand-write a schema-derived
 * type that could drift from the actual Drizzle row shape.
 */
async function loadVerificationContext(tx: Tx, orderId: number) {
  const order = await tx.query.cuttingOrders.findFirst({
    where: eq(cuttingOrders.id, orderId),
  });
  if (!order) return null;

  const recipe = await tx.query.recipes.findFirst({
    where: eq(recipes.id, order.recipeId),
    with: { components: true },
  });
  if (!recipe) {
    throw new Error(
      `Recipe ${order.recipeId} referenced by order ${orderId} does not exist`,
    );
  }

  const items = await tx
    .select()
    .from(verificationItems)
    .where(eq(verificationItems.orderId, orderId));

  const componentNameById = new Map(
    recipe.components.map((c) => [c.id, c.componentName]),
  );

  const ctx: ApprovalContext = {
    expectedComponentCount: recipe.components.length,
    items: items.map((i) => ({
      id: i.id,
      componentId: i.componentId,
      expectedQty: i.expectedQty,
      actualQty: i.actualQty,
      status: i.status,
    })),
    componentNameById,
    actualFabricYds: order.actualFabricYds,
    targetQty: order.targetQty,
    stdFabricYards: recipe.stdFabricYards,
  };

  // `recipe` returned for future consumers (e.g. Phase 6 audit endpoints);
  // not required by any current caller, so unused right now — safe.
  return { order, recipe, ctx };
}
