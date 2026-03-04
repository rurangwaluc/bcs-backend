const {
  pgTable,
  serial,
  integer,
  uniqueIndex,
} = require("drizzle-orm/pg-core");

const stockRequestItems = pgTable(
  "stock_request_items",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id").notNull(),
    productId: integer("product_id").notNull(),
    qty: integer("qty").notNull(),
  },
  (t) => ({
    reqProductUniq: uniqueIndex("stock_request_items_req_product_uniq").on(
      t.requestId,
      t.productId,
    ),
  }),
);

module.exports = { stockRequestItems };
