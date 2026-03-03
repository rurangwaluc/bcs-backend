const {
  pgTable,
  serial,
  integer,
  bigint,
  timestamp,
  uniqueIndex,
} = require("drizzle-orm/pg-core");

const sellerHoldings = pgTable(
  "seller_holdings",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),
    sellerId: integer("seller_id").notNull(),
    productId: bigint("product_id", { mode: "number" }).notNull(),
    qtyOnHand: integer("qty_on_hand").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    locationSellerProductUniq: uniqueIndex(
      "location_seller_product_uniq_sh",
    ).on(t.locationId, t.sellerId, t.productId),
  }),
);

module.exports = { sellerHoldings };
