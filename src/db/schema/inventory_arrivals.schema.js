const {
  pgTable,
  serial,
  integer,
  timestamp,
  text,
} = require("drizzle-orm/pg-core");

const inventoryArrivals = pgTable("inventory_arrivals", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),
  productId: integer("product_id").notNull(),
  qtyReceived: integer("qty_received").notNull(),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

module.exports = { inventoryArrivals };
