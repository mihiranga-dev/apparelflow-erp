// Order lifecycle.
export const ORDER_STATUSES = [
  "CUTTING_IN_PROGRESS",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Per-component traffic light.
export const COMPONENT_STATUSES = ["GREEN", "YELLOW", "RED"] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

// Verifier decision recorded in the immutable audit log.
export const VERIFICATION_DECISIONS = ["APPROVED", "REJECTED"] as const;
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];
