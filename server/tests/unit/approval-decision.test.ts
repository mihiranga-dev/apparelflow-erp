import { describe, expect, it } from "vitest";
import { evaluateApproval } from "../../src/services/verification";

// Pure function — no DB, no HTTP. These tests document every branch of the
// gatekeeper rule and run in milliseconds.

function ctxWith(
  overrides: Partial<Parameters<typeof evaluateApproval>[0]> = {},
) {
  return {
    expectedComponentCount: 2,
    items: [
      {
        id: 1,
        componentId: 10,
        expectedQty: 100,
        actualQty: 100,
        status: "GREEN" as const,
      },
      {
        id: 2,
        componentId: 20,
        expectedQty: 200,
        actualQty: 200,
        status: "GREEN" as const,
      },
    ],
    componentNameById: new Map([
      [10, "Front Body"],
      [20, "Sleeves"],
    ]),
    actualFabricYds: 91.8,
    targetQty: 50,
    stdFabricYards: 1.8,
    ...overrides,
  };
}

describe("evaluateApproval", () => {
  it("approves when all items are counted and GREEN", () => {
    const result = evaluateApproval(ctxWith());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // (91.8 - 90) / 90 * 100 = 2%
      expect(result.wastagePct).toBeCloseTo(2.0, 4);
    }
  });

  it("approves when all items are YELLOW (excess allowed)", () => {
    const result = evaluateApproval(
      ctxWith({
        items: [
          {
            id: 1,
            componentId: 10,
            expectedQty: 100,
            actualQty: 101,
            status: "YELLOW" as const,
          },
          {
            id: 2,
            componentId: 20,
            expectedQty: 200,
            actualQty: 205,
            status: "YELLOW" as const,
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects with MISSING_ITEMS when row count does not match recipe components", () => {
    const result = evaluateApproval(
      ctxWith({
        expectedComponentCount: 5,
        items: [
          {
            id: 1,
            componentId: 10,
            expectedQty: 100,
            actualQty: 100,
            status: "GREEN" as const,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_ITEMS");
  });

  it("rejects with UNCOUNTED_ITEMS when any actualQty is null", () => {
    const result = evaluateApproval(
      ctxWith({
        items: [
          {
            id: 1,
            componentId: 10,
            expectedQty: 100,
            actualQty: 100,
            status: "GREEN" as const,
          },
          {
            id: 2,
            componentId: 20,
            expectedQty: 200,
            actualQty: null,
            status: null,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNCOUNTED_ITEMS");
      expect(result.offendingComponentNames).toEqual(["Sleeves"]);
    }
  });

  it("rejects with SHORTAGE when any item is RED", () => {
    const result = evaluateApproval(
      ctxWith({
        items: [
          {
            id: 1,
            componentId: 10,
            expectedQty: 100,
            actualQty: 100,
            status: "GREEN" as const,
          },
          {
            id: 2,
            componentId: 20,
            expectedQty: 200,
            actualQty: 199,
            status: "RED" as const,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SHORTAGE");
      expect(result.offendingComponentNames).toEqual(["Sleeves"]);
    }
  });

  it("rejects SHORTAGE based on recomputed value even if stored status is GREEN", () => {
    // The stored status lies — a bug or manual SQL edit left it GREEN while
    // actualQty is genuinely short. The service must reject anyway.
    const result = evaluateApproval(
      ctxWith({
        items: [
          {
            id: 1,
            componentId: 10,
            expectedQty: 100,
            actualQty: 100,
            status: "GREEN" as const,
          },
          {
            id: 2,
            componentId: 20,
            expectedQty: 200,
            actualQty: 99,
            status: "GREEN" as const,
          }, // ← lies
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SHORTAGE");
  });

  it("reports MISSING_ITEMS before UNCOUNTED_ITEMS when both conditions hold", () => {
    // Structural problems win — the client should be told the batch record
    // itself is broken before being asked to count anything.
    const result = evaluateApproval(
      ctxWith({
        expectedComponentCount: 5,
        items: [
          {
            id: 1,
            componentId: 10,
            expectedQty: 100,
            actualQty: null,
            status: null,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_ITEMS");
  });

  it("reports UNCOUNTED_ITEMS before SHORTAGE when both conditions hold", () => {
    const result = evaluateApproval(
      ctxWith({
        items: [
          {
            id: 1,
            componentId: 10,
            expectedQty: 100,
            actualQty: 50,
            status: "RED" as const,
          },
          {
            id: 2,
            componentId: 20,
            expectedQty: 200,
            actualQty: null,
            status: null,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNCOUNTED_ITEMS");
  });
});
