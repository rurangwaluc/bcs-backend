const {
  pgTable,
  serial,
  integer,
  bigint,
  varchar,
  timestamp,
  text,
  uniqueIndex,
} = require("drizzle-orm/pg-core");

const credits = pgTable(
  "credits",
  {
    id: serial("id").primaryKey(),

    locationId: integer("location_id").notNull(),
    saleId: integer("sale_id").notNull(),
    customerId: integer("customer_id").notNull(),

    // original credit amount
    principalAmount: bigint("principal_amount", { mode: "number" }).notNull(),

    // running collection totals
    paidAmount: bigint("paid_amount", { mode: "number" }).notNull().default(0),
    remainingAmount: bigint("remaining_amount", { mode: "number" }).notNull(),

    // OPEN_BALANCE now; later INSTALLMENT_PLAN can be added
    creditMode: varchar("credit_mode", { length: 30 })
      .notNull()
      .default("OPEN_BALANCE"),

    // optional promised pay date
    dueDate: timestamp("due_date", { withTimezone: true }),

    // PENDING | APPROVED | PARTIALLY_PAID | SETTLED | REJECTED
    status: varchar("status", { length: 30 }).notNull().default("PENDING"),

    createdBy: integer("created_by").notNull(),

    approvedBy: integer("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    rejectedBy: integer("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),

    settledBy: integer("settled_by"),
    settledAt: timestamp("settled_at", { withTimezone: true }),

    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    // one credit per sale per location
    locationSaleUniq: uniqueIndex("credits_location_sale_uniq").on(
      t.locationId,
      t.saleId,
    ),
  }),
);

module.exports = { credits };
