const { pgTable, serial, integer } = require("drizzle-orm/pg-core");

const stockRequestItems = pgTable("stock_request_items", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  productId: integer("product_id").notNull(),
  qtyRequested: integer("qty_requested").notNull(),
  qtyApproved: integer("qty_approved").default(0)
});

module.exports = { stockRequestItems };
