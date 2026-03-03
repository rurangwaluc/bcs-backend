// backend/src/db/schema/sale_items.schema.js
const { pgTable, serial, integer, bigint } = require("drizzle-orm/pg-core");

const saleItems = pgTable("sale_items", {
  id: serial("id").primaryKey(),

  saleId: integer("sale_id").notNull(),

  // ✅ DB column is bigint (confirmed)
  productId: bigint("product_id", { mode: "number" }).notNull(),

  qty: integer("qty").notNull(),

  // ✅ FIX: bigint (matches DB)
  unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
  lineTotal: bigint("line_total", { mode: "number" }).notNull(),
});

module.exports = { saleItems };