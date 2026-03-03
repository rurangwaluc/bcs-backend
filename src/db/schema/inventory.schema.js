const {
  pgTable,
  serial,
  integer,
  timestamp,
  uniqueIndex,
  bigint,
} = require("drizzle-orm/pg-core");

/**
 * ✅ Canonical inventory balances table
 * DB: inventory_balances (snake_case)
 * product_id must be BIGINT (matches sale_items.product_id)
 */
const inventoryBalances = pgTable(
  "inventory_balances",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),

    // ✅ FIX: bigint
    productId: bigint("product_id", { mode: "number" }).notNull(),

    qtyOnHand: integer("qty_on_hand").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    locationProductUniq: uniqueIndex("inv_balances_location_product_uniq").on(
      t.locationId,
      t.productId
    ),
  })
);

module.exports = { inventoryBalances };