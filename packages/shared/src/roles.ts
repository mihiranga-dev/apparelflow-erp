export const USER_ROLES = [
  "cutting_supervisor",
  "cutting_verifier",
  "sewing_supervisor",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  cutting_supervisor: "Cutting Supervisor",
  cutting_verifier: "Cutting Verifier",
  sewing_supervisor: "Sewing Supervisor",
};

// Runtime guard: used in server middleware and seed validation to reject
// any string that is not a known role before it reaches the database.
export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}
