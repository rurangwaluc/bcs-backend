const {
  pgTable,
  serial,
  varchar,
  timestamp,
  boolean,
  integer
} = require("drizzle-orm/pg-core");

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),

  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 150 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),

  role: varchar("role", { length: 50 }).notNull(),
  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").defaultNow()
});

module.exports = { users };
