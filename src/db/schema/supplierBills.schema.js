const {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  date,
  timestamp,
} = require("drizzle-orm/pg-core");

const { suppliers } = require("./suppliers.schema");

/**
 * Supplier Bills (procurement invoices)
 * - Supports credit / partial payments via supplier_bill_payments
 */

const supplierBills = pgTable("supplier_bills", {
  id: serial("id").primaryKey(),

  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliers.id),

  billNo: varchar("bill_no", { length: 80 }),
  currency: varchar("currency", { length: 8 }).notNull().default("RWF"),

  // totals are stored as integers in minor currency units (RWF has no cents)
  totalAmount: integer("total_amount").notNull(),
  paidAmount: integer("paid_amount").notNull().default(0),

  // DRAFT | OPEN | PAID | VOID
  status: varchar("status", { length: 16 }).notNull().default("OPEN"),

  issuedDate: date("issued_date").defaultNow(),
  dueDate: date("due_date"),

  note: text("note"),

  createdByUserId: integer("created_by_user_id"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

const supplierBillItems = pgTable("supplier_bill_items", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id")
    .notNull()
    .references(() => supplierBills.id),

  // Optional product link (keeps this module independent from inventory)
  productId: integer("product_id"),

  description: varchar("description", { length: 240 }).notNull(),
  qty: integer("qty").notNull(),
  unitCost: integer("unit_cost").notNull(),
  lineTotal: integer("line_total").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

const supplierBillPayments = pgTable("supplier_bill_payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id")
    .notNull()
    .references(() => supplierBills.id),

  amount: integer("amount").notNull(),
  method: varchar("method", { length: 20 }).notNull(),
  reference: varchar("reference", { length: 120 }),
  note: varchar("note", { length: 200 }),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),

  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

module.exports = { supplierBills, supplierBillItems, supplierBillPayments };
