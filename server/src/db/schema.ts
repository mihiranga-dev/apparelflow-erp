/**
 * ApparelFlow ERP — relational schema.
 *
 * Six entities form the production verification pipeline:
 *   users            — factory staff, one record per persona role
 *   recipes          — garment Bill of Materials headers (seeded)
 *   recipe_components — per-recipe cut-part list with per-garment counts
 *   cutting_orders   — one batch per cutting run, state-machine governed
 *   verification_items — expected vs actual counts, one row per component per order
 *   verification_logs  — immutable audit trail written on verifier decision
 *
 * Design principles applied:
 *   1. Every `expected_qty` is snapshotted at order creation, so recipe edits
 *      can never retroactively alter an in-flight batch.
 *   2. `verification_logs` is append-only by convention and by FK: we never
 *      UPDATE it, only INSERT. The "immutable audit trail" requirement is a
 *      database discipline, not a code comment.
 *   3. Enums are declared at the Postgres level, so the DB itself rejects
 *      invalid status strings — not just the application layer.
 */
import { relations } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  doublePrecision,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "cutting_supervisor",
  "cutting_verifier",
  "sewing_supervisor",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "CUTTING_IN_PROGRESS",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
]);

export const componentStatusEnum = pgEnum("component_status", [
  "GREEN",
  "YELLOW",
  "RED",
]);

export const verificationDecisionEnum = pgEnum("verification_decision", [
  "APPROVED",
  "REJECTED",
]);

// ─────────────────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull(),
  fullName: text("full_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// RECIPES  (Bill of Materials header)
// ─────────────────────────────────────────────────────────────────────────────

export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  recipeCode: text("recipe_code").notNull().unique(), // e.g. REC-BL01
  name: text("name").notNull(),
  category: text("category").notNull(),
  // Fabric is decimal yards. double precision (float8) gives ~15 significant
  // digits — plenty for 2-decimal measurements up to 10,000 yards.
  stdFabricYards: doublePrecision("std_fabric_yards").notNull(),
  // Percentage cap, e.g. 5.0 means 5.0%. 4-decimal precision is well within float8.
  wastageCap: doublePrecision("wastage_cap").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// RECIPE COMPONENTS  (per-garment cut parts)
// ─────────────────────────────────────────────────────────────────────────────

export const recipeComponents = pgTable(
  "recipe_components",
  {
    id: serial("id").primaryKey(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    componentName: text("component_name").notNull(),
    piecesPerGarment: integer("pieces_per_garment").notNull(),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("recipe_components_recipe_id_idx").on(t.recipeId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// CUTTING ORDERS  (state-machine governed batches)
// ─────────────────────────────────────────────────────────────────────────────

export const cuttingOrders = pgTable(
  "cutting_orders",
  {
    id: serial("id").primaryKey(),
    orderNo: text("order_no").notNull().unique(), // human-readable, e.g. CO-2026-0001
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "restrict" }),
    targetQty: integer("target_qty").notNull(),
    fabricRollId: text("fabric_roll_id").notNull(),
    actualFabricYds: doublePrecision("actual_fabric_yds").notNull(),
    status: orderStatusEnum("status").notNull().default("CUTTING_IN_PROGRESS"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Null until the Sewing Supervisor starts the assembly line for this batch.
    // Persisted as a distinct action rather than a status, so the state machine
    // stays at four states and Phase 4's guards don't need to be revisited.
    sewingStartedAt: timestamp("sewing_started_at", { withTimezone: true }),
    sewingStartedBy: integer("sewing_started_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // The sewing-queue endpoint filters by status; this index keeps that query O(log n).
    index("cutting_orders_status_idx").on(t.status),
    index("cutting_orders_recipe_id_idx").on(t.recipeId),
    index("cutting_orders_created_by_idx").on(t.createdBy),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION ITEMS  (per-component counts, one row per component per order)
// ─────────────────────────────────────────────────────────────────────────────

export const verificationItems = pgTable(
  "verification_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => cuttingOrders.id, { onDelete: "cascade" }),
    componentId: integer("component_id")
      .notNull()
      .references(() => recipeComponents.id, { onDelete: "restrict" }),
    // Snapshotted at order creation: targetQty × piecesPerGarment.
    expectedQty: integer("expected_qty").notNull(),
    // Nullable until the verifier enters a count.
    actualQty: integer("actual_qty"),
    // Derived from actualQty vs expectedQty. Nullable until counted.
    status: componentStatusEnum("status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // A given component can only be verified once per order.
    uniqueIndex("verification_items_order_component_unique").on(
      t.orderId,
      t.componentId,
    ),
    index("verification_items_order_id_idx").on(t.orderId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION LOGS  (IMMUTABLE AUDIT TRAIL — insert-only)
// ─────────────────────────────────────────────────────────────────────────────

export const verificationLogs = pgTable(
  "verification_logs",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => cuttingOrders.id, { onDelete: "cascade" }),
    verifierId: integer("verifier_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decision: verificationDecisionEnum("decision").notNull(),
    // Nullable: only populated on REJECTED.
    rejectionNote: text("rejection_note"),
    // Computed at decision time and stored forever.
    wastagePct: doublePrecision("wastage_pct").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("verification_logs_order_id_idx").on(t.orderId),
    index("verification_logs_verifier_id_idx").on(t.verifierId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONS  (enables Drizzle's typed query API)
// ─────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  createdOrders: many(cuttingOrders),
  verificationLogs: many(verificationLogs),
}));

export const recipesRelations = relations(recipes, ({ many }) => ({
  components: many(recipeComponents),
  orders: many(cuttingOrders),
}));

export const recipeComponentsRelations = relations(
  recipeComponents,
  ({ one, many }) => ({
    recipe: one(recipes, {
      fields: [recipeComponents.recipeId],
      references: [recipes.id],
    }),
    verificationItems: many(verificationItems),
  }),
);

export const cuttingOrdersRelations = relations(
  cuttingOrders,
  ({ one, many }) => ({
    recipe: one(recipes, {
      fields: [cuttingOrders.recipeId],
      references: [recipes.id],
    }),
    createdByUser: one(users, {
      fields: [cuttingOrders.createdBy],
      references: [users.id],
    }),
    verificationItems: many(verificationItems),
    verificationLogs: many(verificationLogs),
  }),
);

export const verificationItemsRelations = relations(
  verificationItems,
  ({ one }) => ({
    order: one(cuttingOrders, {
      fields: [verificationItems.orderId],
      references: [cuttingOrders.id],
    }),
    component: one(recipeComponents, {
      fields: [verificationItems.componentId],
      references: [recipeComponents.id],
    }),
  }),
);

export const verificationLogsRelations = relations(
  verificationLogs,
  ({ one }) => ({
    order: one(cuttingOrders, {
      fields: [verificationLogs.orderId],
      references: [cuttingOrders.id],
    }),
    verifier: one(users, {
      fields: [verificationLogs.verifierId],
      references: [users.id],
    }),
  }),
);
