import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "../src/db/client";
import {
  users,
  recipes,
  recipeComponents,
  cuttingOrders,
  verificationItems,
} from "../src/db/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Database reset + minimal seed
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wipes every table and restarts serial sequences so IDs are deterministic
 * across test runs. CASCADE drops dependent rows in the correct order without
 * us having to list them in FK order ourselves.
 */
export async function resetDatabase(): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      verification_logs,
      verification_items,
      cutting_orders,
      recipe_components,
      recipes,
      users
    RESTART IDENTITY CASCADE
  `);
}

export const DEMO_PASSWORD = "Password123";

export interface SeededUsers {
  supervisorId: number;
  verifierId: number;
  sewingId: number;
}

/**
 * Seeds the three demo personas and two recipes. Uses bcrypt rounds of 4
 * (vs. production 10) — sufficient for tests, ~16× faster to hash, and the
 * cost of iterating a 4-round hash is still non-trivial for an attacker.
 */
export async function seedMinimumData(): Promise<SeededUsers> {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 4);

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        email: "supervisor@apparelflow.com",
        passwordHash: hash,
        role: "cutting_supervisor",
        fullName: "Test Supervisor",
      },
      {
        email: "verifier@apparelflow.com",
        passwordHash: hash,
        role: "cutting_verifier",
        fullName: "Test Verifier",
      },
      {
        email: "sewing@apparelflow.com",
        passwordHash: hash,
        role: "sewing_supervisor",
        fullName: "Test Sewing",
      },
    ])
    .returning();

  const byRole = (role: string) => insertedUsers.find((u) => u.role === role)!;

  // Recipe A — Casual Blouse (1,1,2,1,2)
  const [blouse] = await db
    .insert(recipes)
    .values({
      recipeCode: "REC-BL01",
      name: "Casual Blouse",
      category: "Blouse",
      stdFabricYards: 1.8,
      wastageCap: 5.0,
    })
    .returning();

  await db.insert(recipeComponents).values([
    {
      recipeId: blouse!.id,
      componentName: "Front Body Panel",
      piecesPerGarment: 1,
    },
    {
      recipeId: blouse!.id,
      componentName: "Back Body Panel",
      piecesPerGarment: 1,
    },
    {
      recipeId: blouse!.id,
      componentName: "Sleeves (Left & Right)",
      piecesPerGarment: 2,
    },
    {
      recipeId: blouse!.id,
      componentName: "Collar & Stand",
      piecesPerGarment: 1,
    },
    {
      recipeId: blouse!.id,
      componentName: "Sleeve Cuffs",
      piecesPerGarment: 2,
    },
  ]);

  // Recipe B — Crop Top (1,1,1,1,2)
  const [cropTop] = await db
    .insert(recipes)
    .values({
      recipeCode: "REC-CT02",
      name: "Crop Top",
      category: "Crop Top",
      stdFabricYards: 1.1,
      wastageCap: 8.0,
    })
    .returning();

  await db.insert(recipeComponents).values([
    {
      recipeId: cropTop!.id,
      componentName: "Front Chest Panel",
      piecesPerGarment: 1,
    },
    {
      recipeId: cropTop!.id,
      componentName: "Back Support Panel",
      piecesPerGarment: 1,
    },
    {
      recipeId: cropTop!.id,
      componentName: "Neck Binding Strip",
      piecesPerGarment: 1,
    },
    {
      recipeId: cropTop!.id,
      componentName: "Hem Elastic Casing",
      piecesPerGarment: 1,
    },
    {
      recipeId: cropTop!.id,
      componentName: "Side Strap Accents",
      piecesPerGarment: 2,
    },
  ]);

  return {
    supervisorId: byRole("cutting_supervisor").id,
    verifierId: byRole("cutting_verifier").id,
    sewingId: byRole("sewing_supervisor").id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level API flows (reused across test files)
// ─────────────────────────────────────────────────────────────────────────────

export async function loginAs(
  baseUrl: string,
  email:
    | "supervisor@apparelflow.com"
    | "verifier@apparelflow.com"
    | "sewing@apparelflow.com",
): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  if (!res.ok) throw new Error(`loginAs(${email}) failed: ${res.status}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

/**
 * Creates a cutting order via direct DB insert with the exact same shape the
 * order-creation endpoint would produce. Used by tests that don't care about
 * the creation flow itself and want to reach the verification stage quickly.
 */
export async function createOrderDirect(params: {
  recipeId: number;
  targetQty: number;
  createdBy: number;
  fabricRollId?: string;
  actualFabricYds?: number;
  orderNo?: string;
}): Promise<{
  orderId: number;
  itemIds: number[];
  expectedQtyById: Record<number, number>;
}> {
  const recipe = await db.query.recipes.findFirst({
    where: (r, { eq }) => eq(r.id, params.recipeId),
    with: { components: true },
  });
  if (!recipe) throw new Error(`Recipe ${params.recipeId} not found`);

  const [order] = await db
    .insert(cuttingOrders)
    .values({
      orderNo:
        params.orderNo ??
        `CO-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      recipeId: params.recipeId,
      targetQty: params.targetQty,
      fabricRollId: params.fabricRollId ?? "FAB-TEST",
      actualFabricYds:
        params.actualFabricYds ??
        params.targetQty * recipe.stdFabricYards * 1.02,
      status: "PENDING_VERIFICATION",
      createdBy: params.createdBy,
    })
    .returning();

  const expectedQtyById: Record<number, number> = {};
  const items = recipe.components.map((c) => {
    const expected = params.targetQty * c.piecesPerGarment;
    expectedQtyById[c.id] = expected;
    return {
      orderId: order!.id,
      componentId: c.id,
      expectedQty: expected,
      actualQty: null as number | null,
      status: null as "GREEN" | "YELLOW" | "RED" | null,
    };
  });

  const inserted = await db.insert(verificationItems).values(items).returning();

  return {
    orderId: order!.id,
    itemIds: inserted.map((i) => i.id),
    expectedQtyById,
  };
}

/**
 * Marks every verification item GREEN by writing actualQty = expectedQty.
 * Returns nothing — callers should re-fetch if they need the fresh state.
 */
export async function countAllGreen(orderId: number): Promise<void> {
  await db.execute(sql`
    UPDATE verification_items
    SET actual_qty = expected_qty, status = 'GREEN'
    WHERE order_id = ${orderId}
  `);
}

/**
 * Marks every item GREEN except the LAST one, which is set to (expected - 1)
 * and flagged RED. Returns the component id of the short component.
 */
export async function countAllGreenExceptLastShort(
  orderId: number,
): Promise<number> {
  const items = await db.query.verificationItems.findMany({
    where: (i, { eq }) => eq(i.orderId, orderId),
    orderBy: (i, { asc }) => [asc(i.id)],
  });
  if (items.length === 0) throw new Error("No items to mark");

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const isLast = i === items.length - 1;
    const actualQty = isLast ? item.expectedQty - 1 : item.expectedQty;
    const status = isLast ? "RED" : "GREEN";
    await db.execute(sql`
      UPDATE verification_items
      SET actual_qty = ${actualQty}, status = ${status}
      WHERE id = ${item.id}
    `);
  }
  return items[items.length - 1]!.componentId;
}
