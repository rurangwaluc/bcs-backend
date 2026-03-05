const {
  pgTable,
  serial,
  integer,
  text,
  bigint,
} = require("drizzle-orm/pg-core");
const { supplierBills } = require("./supplier_bills.schema");

const supplierBillItems = pgTable("supplier_bill_items", {
  id: serial("id").primaryKey(),

  supplierBillId: integer("supplier_bill_id")
    .notNull()
    .references(() => supplierBills.id, { onDelete: "cascade" }),

  productId: integer("product_id"),
  productName: text("product_name").notNull(),

  qty: integer("qty").notNull().default(0),
  unitCost: bigint("unit_cost", { mode: "number" }).notNull().default(0),
  lineTotal: bigint("line_total", { mode: "number" }).notNull().default(0),
});

module.exports = { supplierBillItems };
