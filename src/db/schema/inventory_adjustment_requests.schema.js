const { pgTable, serial, integer, varchar, timestamp, bigint, text } = require("drizzle-orm/pg-core");

const inventoryAdjustmentRequests = pgTable("inventory_adjustment_requests", {
  id: serial("id").primaryKey(),

  locationId: integer("location_id").notNull(),

  productId: bigint("product_id", { mode: "number" }).notNull(),

  // ✅ match service (qtyChange)
  qtyChange: integer("qty_change").notNull(),

  // ✅ match service
  reason: text("reason").notNull(),

  status: varchar("status", { length: 20 }).notNull().default("PENDING"),

  // ✅ match service naming
  requestedByUserId: integer("requested_by_user_id").notNull(),

  decidedByUserId: integer("decided_by_user_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

module.exports = { inventoryAdjustmentRequests };