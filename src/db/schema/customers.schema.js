// backend/src/db/schema/customers.schema.js
const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  text,
  uniqueIndex,
} = require("drizzle-orm/pg-core");

const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),

    name: varchar("name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),

    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    // ✅ prevent duplicates per shop/location
    uniqPhonePerLocation: uniqueIndex("customers_phone_location_unique").on(
      t.locationId,
      t.phone,
    ),
  }),
);

module.exports = { customers };
