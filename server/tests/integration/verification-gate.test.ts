import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import {
  DEMO_PASSWORD,
  countAllGreen,
  countAllGreenExceptLastShort,
  createOrderDirect,
  resetDatabase,
  seedMinimumData,
  type SeededUsers,
} from "../helpers";

const app = createApp();

let seeded: SeededUsers;
let supervisorToken: string;
let verifierToken: string;
let sewingToken: string;

/** Signs in via the real endpoint so tests exercise the same auth path as prod. */
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
  verifierToken = await login("verifier@apparelflow.com");
  sewingToken = await login("sewing@apparelflow.com");
});

describe("MANDATORY TEST 1 — all-GREEN batch can be approved by a Verifier", () => {
  it("returns 200 with VERIFIED status, wastage pct, and a log id", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 10,
      createdBy: seeded.supervisorId,
      actualFabricYds: 18.5, // expected 18.0 → 2.78% wastage
    });
    await countAllGreen(order.orderId);

    const res = await request(app)
      .post(`/api/verification/orders/${order.orderId}/approve`)
      .set("Authorization", `Bearer ${verifierToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("VERIFIED");
    expect(res.body.wastagePct).toBeCloseTo(2.7778, 3);
    expect(res.body.logId).toBeGreaterThan(0);
  });

  it("writes the verifier id and timestamp onto the audit log", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
      actualFabricYds: 9,
    });
    await countAllGreen(order.orderId);

    const res = await request(app)
      .post(`/api/verification/orders/${order.orderId}/approve`)
      .set("Authorization", `Bearer ${verifierToken}`);

    expect(res.status).toBe(200);

    // Read the log back via the sewing detail endpoint (verifier cannot re-read
    // a decided order — the sewing supervisor is the role that owns post-decision reads).
    const detail = await request(app)
      .get(`/api/sewing/queue/${order.orderId}`)
      .set("Authorization", `Bearer ${sewingToken}`);

    expect(detail.status).toBe(200);
    const log = detail.body.order.verificationLogs.find(
      (l: { decision: string }) => l.decision === "APPROVED",
    );
    expect(log).toBeDefined();
    expect(log.verifierId).toBe(seeded.verifierId);
    expect(typeof log.createdAt).toBe("string");
  });
});

describe("MANDATORY TEST 2 — RED component blocks approval with 422", () => {
  it("returns 422 SHORTAGE naming the offending component", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    const shortComponentId = await countAllGreenExceptLastShort(order.orderId);

    const res = await request(app)
      .post(`/api/verification/orders/${order.orderId}/approve`)
      .set("Authorization", `Bearer ${verifierToken}`);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SHORTAGE");
    expect(res.body.details.componentNames.length).toBeGreaterThan(0);
    expect(shortComponentId).toBeGreaterThan(0);
  });

  it("does not flip the order status on rejected approval", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    await countAllGreenExceptLastShort(order.orderId);

    await request(app)
      .post(`/api/verification/orders/${order.orderId}/approve`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .expect(422);

    // Verify order is still PENDING_VERIFICATION by hitting the verifier detail endpoint.
    const detail = await request(app)
      .get(`/api/verification/orders/${order.orderId}`)
      .set("Authorization", `Bearer ${verifierToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.order.status).toBe("PENDING_VERIFICATION");
  });

  it("returns 422 UNCOUNTED_ITEMS when any component has not been counted", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    // Do NOT count anything.

    const res = await request(app)
      .post(`/api/verification/orders/${order.orderId}/approve`)
      .set("Authorization", `Bearer ${verifierToken}`);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("UNCOUNTED_ITEMS");
  });
});

describe("MANDATORY TEST 3 — rejection without a reason is rejected by the backend", () => {
  it("returns 422 when rejectionNote is missing", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    const res = await request(app)
      .post(`/api/verification/orders/${order.orderId}/reject`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({});
    expect(res.status).toBe(422);
  });

  it("returns 422 when rejectionNote is whitespace only", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    const res = await request(app)
      .post(`/api/verification/orders/${order.orderId}/reject`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ rejectionNote: "     " });
    expect(res.status).toBe(422);
  });

  it("accepts a valid rejection and flips status to REJECTED", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    const res = await request(app)
      .post(`/api/verification/orders/${order.orderId}/reject`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({
        rejectionNote: "Cuff count short by 3; sleeves have fabric flaw.",
      });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("REJECTED");
  });
});

describe("MANDATORY TEST 4 — non-verifier roles receive 403 on approve", () => {
  it("blocks the cutting supervisor with 403", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    await countAllGreen(order.orderId);

    const res = await request(app)
      .post(`/api/verification/orders/${order.orderId}/approve`)
      .set("Authorization", `Bearer ${supervisorToken}`);

    expect(res.status).toBe(403);
    expect(res.body.requiredRoles).toContain("cutting_verifier");
  });

  it("blocks the sewing supervisor with 403", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    await countAllGreen(order.orderId);

    const res = await request(app)
      .post(`/api/verification/orders/${order.orderId}/approve`)
      .set("Authorization", `Bearer ${sewingToken}`);

    expect(res.status).toBe(403);
  });

  it("blocks an anonymous caller with 401", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    await countAllGreen(order.orderId);

    const res = await request(app).post(
      `/api/verification/orders/${order.orderId}/approve`,
    );
    expect(res.status).toBe(401);
  });

  it("ignores a client-supplied verifierId in the approval body", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    await countAllGreen(order.orderId);

    const res = await request(app)
      .post(`/api/verification/orders/${order.orderId}/approve`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ verifierId: seeded.supervisorId }); // spoof attempt

    expect(res.status).toBe(200);

    const detail = await request(app)
      .get(`/api/sewing/queue/${order.orderId}`)
      .set("Authorization", `Bearer ${sewingToken}`);

    const log = detail.body.order.verificationLogs.find(
      (l: { decision: string }) => l.decision === "APPROVED",
    );
    // The log must attribute to the verifier (from JWT), NOT the spoofed body.
    expect(log.verifierId).toBe(seeded.verifierId);
    expect(log.verifierId).not.toBe(seeded.supervisorId);
  });
});

describe("MANDATORY TEST 5 — unapproved orders never appear in the Sewing Queue", () => {
  it("excludes PENDING_VERIFICATION orders from GET /api/sewing/queue", async () => {
    await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    const res = await request(app)
      .get("/api/sewing/queue")
      .set("Authorization", `Bearer ${sewingToken}`);
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(0);
  });

  it("excludes REJECTED orders from GET /api/sewing/queue", async () => {
    const order = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    await request(app)
      .post(`/api/verification/orders/${order.orderId}/reject`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ rejectionNote: "Not acceptable." });

    const res = await request(app)
      .get("/api/sewing/queue")
      .set("Authorization", `Bearer ${sewingToken}`);
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(0);
  });

  it("returns only the VERIFIED order when mixed batches exist", async () => {
    // Create three orders: one pending, one rejected, one approved.
    const pending = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });

    const rejected = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    await request(app)
      .post(`/api/verification/orders/${rejected.orderId}/reject`)
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ rejectionNote: "Bad batch." });

    const approved = await createOrderDirect({
      recipeId: 1,
      targetQty: 5,
      createdBy: seeded.supervisorId,
    });
    await countAllGreen(approved.orderId);
    await request(app)
      .post(`/api/verification/orders/${approved.orderId}/approve`)
      .set("Authorization", `Bearer ${verifierToken}`);

    const res = await request(app)
      .get("/api/sewing/queue")
      .set("Authorization", `Bearer ${sewingToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].id).toBe(approved.orderId);
    expect(res.body.orders[0].status).toBe("VERIFIED");
    // Sanity: the pending and rejected ids are absent.
    const ids = res.body.orders.map((o: { id: number }) => o.id);
    expect(ids).not.toContain(pending.orderId);
    expect(ids).not.toContain(rejected.orderId);
  });

  it("blocks supervisor and verifier from reading the sewing queue with 403", async () => {
    for (const token of [supervisorToken, verifierToken]) {
      const res = await request(app)
        .get("/api/sewing/queue")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });
});
