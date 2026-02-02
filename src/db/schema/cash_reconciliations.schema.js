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

const cashReconciliations = pgTable("cash_reconciliations", {
  id: serial("id").primaryKey(),

  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),

  cashSessionId: integer("cash_session_id")
    .notNull()
    .references(() => cashSessions.id, { onDelete: "cascade" }),

  cashierId: integer("cashier_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  expectedCash: bigint("expected_cash", { mode: "number" }).notNull(),
  countedCash: bigint("counted_cash", { mode: "number" }).notNull(),

  // difference is computed in the DB, do NOT insert manually
  difference: bigint("difference", { mode: "number" }),

  note: varchar("note", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

module.exports = { cashReconciliations };
