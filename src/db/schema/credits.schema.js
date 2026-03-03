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
    amount: bigint("amount", { mode: "number" }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
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
    // globally unique index
    locationCustomerUniq: uniqueIndex("credits_location_customer_uniq").on(
      t.locationId,
      t.customerId,
    ),
  }),
);

module.exports = { credits };
