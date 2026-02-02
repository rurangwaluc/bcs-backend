const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  bigint,
} = require("drizzle-orm/pg-core");
const { locations } = require("./locations.schema"); // adjust if your file name differs
const { users } = require("./users.schema"); // adjust if your file name differs

const cashSessions = pgTable("cash_sessions", {
  id: serial("id").primaryKey(),

  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),

  cashierId: integer("cashier_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  status: varchar("status", { length: 20 }).notNull().default("OPEN"), // OPEN | CLOSED

  openedAt: timestamp("opened_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),

  // amounts stored as integer money (RWF) => use bigint for safety
  openingBalance: bigint("opening_balance", { mode: "number" })
    .notNull()
    .default(0),
  closingBalance: bigint("closing_balance", { mode: "number" })
    .notNull()
    .default(0),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

module.exports = { cashSessions };
