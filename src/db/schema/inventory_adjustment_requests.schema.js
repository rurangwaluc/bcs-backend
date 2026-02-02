const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  text,
} = require("drizzle-orm/pg-core");

const inventoryAdjustmentRequests = pgTable("inventory_adjustment_requests", {
  id: serial("id").primaryKey(),

  locationId: integer("location_id").notNull(),
  productId: integer("product_id").notNull(),

  qtyChange: integer("qty_change").notNull(),
  reason: text("reason").notNull(),

  status: varchar("status", { length: 20 }).notNull().default("PENDING"),

  requestedByUserId: integer("requested_by_user_id").notNull(),
  decidedByUserId: integer("decided_by_user_id"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
});

module.exports = { inventoryAdjustmentRequests };
