const {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  date,
  timestamp,
  index,
} = require("drizzle-orm/pg-core");

const { suppliers } = require("./suppliers.schema");
const { locations } = require("./locations.schema");

/**
 * Supplier Bills (procurement liabilities)
 *
 * Real-world rules:
 * - Supplier directory is global
 * - Each bill belongs to one branch/location
 * - Bill can be unpaid, partially paid, or fully paid
 * - Multiple installment payments are supported
 * - Owner can track outstanding balance and overdue bills cleanly
 */

const supplierBills = pgTable(
  "supplier_bills",
  {
    id: serial("id").primaryKey(),

    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),

    // ✅ branch ownership is required for a multi-location BCS
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),

    billNo: varchar("bill_no", { length: 80 }),

    // RWF / USD / CNY / AED ...
    currency: varchar("currency", { length: 8 }).notNull().default("RWF"),

    // Stored as integer money amounts
    totalAmount: integer("total_amount").notNull(),
    paidAmount: integer("paid_amount").notNull().default(0),

    /**
     * DRAFT           - bill prepared but not yet operational
     * OPEN            - unpaid
     * PARTIALLY_PAID  - installment(s) started but not complete
     * PAID            - fully settled
     * VOID            - soft-deleted / cancelled operationally
     */
    status: varchar("status", { length: 20 }).notNull().default("OPEN"),

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
  },
  (t) => ({
    supplierBillsSupplierIdx: index("supplier_bills_supplier_idx").on(
      t.supplierId,
    ),
    supplierBillsLocationIdx: index("supplier_bills_location_idx").on(
      t.locationId,
    ),
    supplierBillsStatusIdx: index("supplier_bills_status_idx").on(t.status),
    supplierBillsDueDateIdx: index("supplier_bills_due_date_idx").on(t.dueDate),
    supplierBillsCreatedAtIdx: index("supplier_bills_created_at_idx").on(
      t.createdAt,
    ),
    supplierBillsSupplierLocationIdx: index(
      "supplier_bills_supplier_location_idx",
    ).on(t.supplierId, t.locationId),
  }),
);

const supplierBillItems = pgTable(
  "supplier_bill_items",
  {
    id: serial("id").primaryKey(),

    billId: integer("bill_id")
      .notNull()
      .references(() => supplierBills.id, { onDelete: "cascade" }),

    // Optional product link
    productId: integer("product_id"),

    description: varchar("description", { length: 240 }).notNull(),
    qty: integer("qty").notNull(),
    unitCost: integer("unit_cost").notNull(),
    lineTotal: integer("line_total").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    supplierBillItemsBillIdx: index("supplier_bill_items_bill_idx").on(
      t.billId,
    ),
    supplierBillItemsProductIdx: index("supplier_bill_items_product_idx").on(
      t.productId,
    ),
  }),
);

const supplierBillPayments = pgTable(
  "supplier_bill_payments",
  {
    id: serial("id").primaryKey(),

    billId: integer("bill_id")
      .notNull()
      .references(() => supplierBills.id, { onDelete: "cascade" }),

    amount: integer("amount").notNull(),

    // CASH / MOMO / BANK / CARD / OTHER
    method: varchar("method", { length: 20 }).notNull(),

    reference: varchar("reference", { length: 120 }),
    note: varchar("note", { length: 200 }),

    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),

    createdByUserId: integer("created_by_user_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    supplierBillPaymentsBillIdx: index("supplier_bill_payments_bill_idx").on(
      t.billId,
    ),
    supplierBillPaymentsMethodIdx: index(
      "supplier_bill_payments_method_idx",
    ).on(t.method),
    supplierBillPaymentsPaidAtIdx: index(
      "supplier_bill_payments_paid_at_idx",
    ).on(t.paidAt),
  }),
);

module.exports = {
  supplierBills,
  supplierBillItems,
  supplierBillPayments,
};
