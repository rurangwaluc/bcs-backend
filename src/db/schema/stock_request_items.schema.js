const { pgTable, serial, integer, timestamp, uniqueIndex, bigint } = require("drizzle-orm/pg-core");

const sellerHoldings = pgTable(
  "seller_holdings",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),
    sellerId: integer("seller_id").notNull(),
    productId: bigint("product_id", { mode: "number" }).notNull(),
    qtyOnHand: integer("qty_on_hand").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("seller_holdings_location_seller_product_uniq").on(
      t.locationId,
      t.sellerId,
      t.productId
    ),
  })
);

module.exports = { sellerHoldings };