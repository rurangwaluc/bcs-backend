// backend/src/db/schema/credits.schema.js
const {
  pgTable,
  serial,
  integer,
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

    amount: integer("amount").notNull(),

    status: varchar("status", { length: 20 }).notNull().default("OPEN"), // OPEN, SETTLED

    createdBy: integer("created_by").notNull(), // seller
    approvedBy: integer("approved_by"), // manager/admin
    approvedAt: timestamp("approved_at"),

    settledBy: integer("settled_by"),
    settledAt: timestamp("settled_at"),

    note: text("note"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    // ✅ prevent duplicate credit per sale in same location
    uniqCreditPerSale: uniqueIndex("credits_sale_location_unique").on(
      t.locationId,
      t.saleId,
    ),
  }),
);

module.exports = { credits };
