const {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
} = require("drizzle-orm/pg-core");

const products = pgTable("products", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),

  name: varchar("name", { length: 180 }).notNull(),
  sku: varchar("sku", { length: 80 }),
  unit: varchar("unit", { length: 40 }).default("unit"),

  sellingPrice: integer("selling_price").notNull(),
  costPrice: integer("cost_price").default(0),

  // ✅ NEW (needed for discount rules)
  maxDiscountPercent: integer("max_discount_percent").notNull().default(0),

  isActive: boolean("is_active").default(true),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
});

module.exports = { products };
