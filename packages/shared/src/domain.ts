import type { ComponentStatus } from "./status";

/**
 * The single source of truth for the traffic-light rule.
 * Client uses this for instant UI feedback; server re-runs it as the real guard.
 * Never trust the client's computed value — always recompute server-side.
 */
export function evaluateComponentStatus(
  actualQty: number,
  expectedQty: number,
): ComponentStatus {
  if (actualQty === expectedQty) return "GREEN";
  if (actualQty > expectedQty) return "YELLOW";
  return "RED";
}

/**
 * Expected component count for a batch.
 * e.g. 50 garments x 2 cuffs = 100 cuffs expected.
 */
export function expectedComponentQty(
  targetQty: number,
  piecesPerGarment: number,
): number {
  return targetQty * piecesPerGarment;
}

/**
 * Fabric wastage percentage.
 * = ((actual - expected) / expected) * 100
 * Guarded so a zero standard-fabric recipe can never divide-by-zero.
 */
export function calculateWastagePct(
  actualFabricYds: number,
  expectedFabricYds: number,
): number {
  if (expectedFabricYds <= 0) {
    throw new Error("expectedFabricYds must be greater than zero");
  }
  return ((actualFabricYds - expectedFabricYds) / expectedFabricYds) * 100;
}

/**
 * A batch may only be approved when no component is RED.
 * Missing/uncounted components are treated as blocking (server-side).
 */
export function hasAnyShortage(statuses: ComponentStatus[]): boolean {
  return statuses.some((s) => s === "RED");
}
