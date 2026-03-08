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

    tin: varchar("tin", { length: 60 }),
    address: text("address"),
    notes: text("notes"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    uniqPhonePerLocation: uniqueIndex("customers_phone_location_unique").on(
      t.locationId,
      t.phone,
    ),
  }),
);

module.exports = { customers };
