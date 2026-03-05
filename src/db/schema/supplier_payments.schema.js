const {
  pgTable,
  serial,
  integer,
  text,
  bigint,
  timestamp,
} = require("drizzle-orm/pg-core");
const { suppliers } = require("./suppliers.schema");
const { supplierBills } = require("./supplier_bills.schema");

const supplierPayments = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),

  supplierBillId: integer("supplier_bill_id")
    .notNull()
    .references(() => supplierBills.id, { onDelete: "cascade" }),

  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliers.id, { onDelete: "restrict" }),

  locationId: integer("location_id"),

  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  method: text("method").notNull().default("BANK"), // CASH|MOMO|CARD|BANK|OTHER

  reference: text("reference"),
  note: text("note"),

  paidAt: timestamp("paid_at").notNull().defaultNow(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

module.exports = { supplierPayments };
