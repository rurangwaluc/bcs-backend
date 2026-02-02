const {
  pgTable,
  serial,
  integer,
  timestamp,
  uniqueIndex,
} = require("drizzle-orm/pg-core");

// IMPORTANT:
// The real table in this project is **inventory_balances**.
// If this schema points to "inventory", you will get runtime errors like:
//   relation "inventory" does not exist
const inventoryBalances = pgTable(
  "inventory_balances",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),
    productId: integer("product_id").notNull(),
    qtyOnHand: integer("qty_on_hand").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    locationProductUnique: uniqueIndex("inventory_location_product_uniq").on(
      t.locationId,
      t.productId,
    ),
  }),
);

module.exports = { inventoryBalances };
