const {
  pgTable,
  serial,
  integer,
  bigint,
  varchar,
  timestamp,
  text,
  uniqueIndex,
  index,
} = require("drizzle-orm/pg-core");

const creditInstallments = pgTable(
  "credit_installments",
  {
    id: serial("id").primaryKey(),

    locationId: integer("location_id").notNull(),
    creditId: integer("credit_id").notNull(),
    saleId: integer("sale_id").notNull(),

    installmentNo: integer("installment_no").notNull(),

    amount: bigint("amount", { mode: "number" }).notNull(),
    paidAmount: bigint("paid_amount", { mode: "number" }).notNull().default(0),
    remainingAmount: bigint("remaining_amount", { mode: "number" }).notNull(),

    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),

    // PENDING | PARTIALLY_PAID | PAID
    status: varchar("status", { length: 30 }).notNull().default("PENDING"),

    paidAt: timestamp("paid_at", { withTimezone: true }),
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    creditInstallmentUniq: uniqueIndex("credit_installments_credit_no_uniq").on(
      t.locationId,
      t.creditId,
      t.installmentNo,
    ),
    creditInstallmentCreditIdx: index("credit_installments_credit_idx").on(
      t.locationId,
      t.creditId,
    ),
    creditInstallmentSaleIdx: index("credit_installments_sale_idx").on(
      t.locationId,
      t.saleId,
    ),
  }),
);

module.exports = { creditInstallments };
