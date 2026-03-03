// backend/src/db/schema/refund_items.schema.js

const { pgTable, bigserial, bigint, integer } = require("drizzle-orm/pg-core");

const refundItems = pgTable("refund_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),

  refundId: bigint("refund_id", { mode: "number" }).notNull(),
  saleItemId: integer("sale_item_id").notNull(),

  // confirmed: sale_items.product_id is bigint
  productId: bigint("product_id", { mode: "number" }).notNull(),

  qty: integer("qty").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
});

module.exports = { refundItems };