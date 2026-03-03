const { pgTable, serial, integer, timestamp, text, bigint } = require("drizzle-orm/pg-core");

const inventoryArrivals = pgTable("inventory_arrivals", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  qtyReceived: integer("qty_received").notNull(),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

module.exports = { inventoryArrivals };