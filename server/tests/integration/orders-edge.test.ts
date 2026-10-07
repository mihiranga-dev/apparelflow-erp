import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { verificationItems } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import {
  DEMO_PASSWORD,
  createOrderDirect,
  resetDatabase,
  seedMinimumData,
  type SeededUsers,
} from "../helpers";

const app = createApp();
let seeded: SeededUsers;
let supervisorToken: string;

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post("/auth/login")
    .send({ email, password: DEMO_PASSWORD });
  return res.body.token as string;
}

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  seeded = await seedMinimumData();
  supervisorToken = await login("supervisor@apparelflow.com");
});

describe("POST /api/orders — validation and multiplier engine", () => {
  it("creates the order and pre-computes expected component quantities", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        recipeId: 1,
        targetQty: 50,
        fabricRollId: "FAB-ROLL-882",
        actualFabricYds: 95.5,
      });

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("PENDING_VERIFICATION");

    const items = await db
      .select()
      .from(verificationItems)
      .where(eq(verificationItems.orderId, res.body.order.id));

    const byExpected = items.map((i) => i.expectedQty).sort((a, b) => a - b);
    // 50×1, 50×1, 50×2, 50×1, 50×2 → [50, 50, 50, 100, 100]
    expect(byExpected).toEqual([50, 50, 50, 100, 100]);
    expect(items.every((i) => i.actualQty === null)).toBe(true);
    expect(items.every((i) => i.status === null)).toBe(true);
  });

  it("rejects negative targetQty with 400", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        recipeId: 1,
        targetQty: -5,
        fabricRollId: "X",
        actualFabricYds: 1,
      });
    expect(res.status).toBe(400);
  });

  it("rejects decimal targetQty with 400", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        recipeId: 1,
        targetQty: 5.5,
        fabricRollId: "X",
        actualFabricYds: 2,
      });
    expect(res.status).toBe(400);
  });

  it("rejects 3-decimal fabric yards with 400", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        recipeId: 1,
        targetQty: 5,
        fabricRollId: "X",
        actualFabricYds: 5.555,
      });
    expect(res.status).toBe(400);
  });

  it("rejects empty fabric roll id with 400", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        recipeId: 1,
        targetQty: 5,
        fabricRollId: "",
        actualFabricYds: 5,
      });
    expect(res.status).toBe(400);
  });

  it("rejects unknown recipeId with 404", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        recipeId: 99999,
        targetQty: 5,
        fabricRollId: "X",
        actualFabricYds: 5,
      });
    expect(res.status).toBe(404);
  });

  it("rejects malformed JSON with 400 (not 500)", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/orders — role scoping", () => {
  it("supervisor sees only their own orders", async () => {
    await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    await createOrderDirect({
      recipeId: 1,
      targetQty: 7,
      createdBy: seeded.verifierId,
    }); // different creator

    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].createdBy).toBe(seeded.supervisorId);
  });
});

describe("PUT /api/verification-items/:id — server-computed status", () => {
  it("computes GREEN/YELLOW/RED from the count (ignoring any client-supplied status)", async () => {
    const verifierToken = await login("verifier@apparelflow.com");
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 10,
      createdBy: seeded.supervisorId,
    });

    const firstItemId = order.itemIds[0]!;
    const expected =
      order.expectedQtyById[
        (await db.query.verificationItems.findFirst({
          where: eq(verificationItems.id, firstItemId),
        }))!.componentId
      ]!;

    // Exact match → GREEN
    const green = await request(app)
      .put(`/api/verification-items/${firstItemId}`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ actualQty: expected, status: "RED" }); // ← spoof attempt
    expect(green.status).toBe(200);
    expect(green.body.item.status).toBe("GREEN");

    // Excess → YELLOW
    const yellow = await request(app)
      .put(`/api/verification-items/${firstItemId}`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ actualQty: expected + 1 });
    expect(yellow.body.item.status).toBe("YELLOW");

    // Short → RED
    const red = await request(app)
      .put(`/api/verification-items/${firstItemId}`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ actualQty: expected - 1 });
    expect(red.body.item.status).toBe("RED");
  });

  it("rejects negative counts with 400", async () => {
    const verifierToken = await login("verifier@apparelflow.com");
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    const res = await request(app)
      .put(`/api/verification-items/${order.itemIds[0]}`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ actualQty: -1 });
    expect(res.status).toBe(400);
  });

  it("rejects decimal counts with 400", async () => {
    const verifierToken = await login("verifier@apparelflow.com");
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    const res = await request(app)
      .put(`/api/verification-items/${order.itemIds[0]}`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ actualQty: 1.5 });
    expect(res.status).toBe(400);
  });

  it("rejects edits to items whose order is no longer pending with 409", async () => {
    const verifierToken = await login("verifier@apparelflow.com");
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    // Reject the batch first.
    await request(app)
      .post(`/api/verification/orders/${order.orderId}/reject`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ rejectionNote: "Defect." });

    const res = await request(app)
      .put(`/api/verification-items/${order.itemIds[0]}`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ actualQty: 1 });
    expect(res.status).toBe(409);
  });
});

describe("Sewing queue — start action idempotency", () => {
  it("returns 409 on a second start and preserves the original actor", async () => {
    const verifierToken = await login("verifier@apparelflow.com");
    const sewingToken = await login("sewing@apparelflow.com");

    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    // Manually green it and approve via service to reach VERIFIED quickly.
    await db.execute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await import("drizzle-orm")).sql`
        UPDATE verification_items SET actual_qty = expected_qty, status = 'GREEN'
        WHERE order_id = ${order.orderId}
      `,
    );
    await request(app)
      .post(`/api/verification/orders/${order.orderId}/approve`)
      .set("Authorization", `Bearer ${verifierToken}`);

    const first = await request(app)
      .post(`/api/sewing/queue/${order.orderId}/start`)
      .set("Authorization", `Bearer ${sewingToken}`);
    expect(first.status).toBe(200);
    const firstStartedAt = first.body.order.sewingStartedAt;

    const second = await request(app)
      .post(`/api/sewing/queue/${order.orderId}/start`)
      .set("Authorization", `Bearer ${sewingToken}`);
    expect(second.status).toBe(409);

    // Re-read to confirm the timestamp was NOT overwritten by the second call.
    const detail = await request(app)
      .get(`/api/sewing/queue/${order.orderId}`)
      .set("Authorization", `Bearer ${sewingToken}`);
    expect(detail.body.order.sewingStartedAt).toBe(firstStartedAt);
  });
});
