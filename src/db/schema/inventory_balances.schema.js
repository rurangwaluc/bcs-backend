const {
  pgTable,
  serial,
  integer,
  timestamp,
  uniqueIndex,
} = require("drizzle-orm/pg-core");

/**
 * ✅ Canonical inventory balances table
 *
 * Your Postgres table is named: inventory_balances
 * Columns are snake_case in DB.
 */
const inventoryBalances = pgTable(
  "inventory_balances",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),
    productId: integer("product_id").notNull(),
    qtyOnHand: integer("qty_on_hand").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    locationProductUniq: uniqueIndex("inv_balances_location_product_uniq").on(
      t.locationId,
      t.productId,
    ),
  }),
);

module.exports = { inventoryBalances };
