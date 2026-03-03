// backend/src/db/schema/sales.schema.js
const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  text,
  bigint,
} = require("drizzle-orm/pg-core");

const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),

  sellerId: integer("seller_id").notNull(),
  customerId: integer("customer_id"),

  customerName: varchar("customer_name", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 40 }),

  status: varchar("status", { length: 40 }).notNull().default("DRAFT"),

  // ✅ FIX: bigint (matches DB)
  totalAmount: bigint("total_amount", { mode: "number" }).notNull().default(0),

  // seller-selected method (optional)
  paymentMethod: varchar("payment_method", { length: 30 }),

  note: text("note"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),

  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  canceledBy: integer("canceled_by"),
  cancelReason: text("cancel_reason"),
});

module.exports = { sales };