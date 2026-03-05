const {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
} = require("drizzle-orm/pg-core");

/**
 * Suppliers
 * Standalone vendor directory (not tied to daily sales).
 */
const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  contactName: varchar("contact_name", { length: 140 }),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 140 }),
  country: varchar("country", { length: 120 }),
  city: varchar("city", { length: 120 }),

  // Where supplier comes from (LOCAL/ABROAD). Keep free-form to avoid breaking.
  sourceType: varchar("source_type", { length: 24 }).default("LOCAL"),

  address: text("address"),
  notes: text("notes"),

  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

module.exports = { suppliers };
