const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  bigint,
} = require("drizzle-orm/pg-core");
const { locations } = require("./locations.schema");
const { users } = require("./users.schema");
const { cashSessions } = require("./cash_sessions.schema");

const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),

  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),

  cashSessionId: integer("cash_session_id").references(() => cashSessions.id, {
    onDelete: "set null",
  }),

  cashierId: integer("cashier_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  category: varchar("category", { length: 60 }).notNull().default("GENERAL"),
  amount: bigint("amount", { mode: "number" }).notNull(),

  // supplier invoice, receipt, etc
  reference: varchar("reference", { length: 80 }),
  note: varchar("note", { length: 200 }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

module.exports = { expenses };
