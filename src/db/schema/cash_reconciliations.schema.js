// backend/src/db/schema/cash_reconciliations.schema.js

const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  bigint,
  uniqueIndex,
} = require("drizzle-orm/pg-core");

const { locations } = require("./locations.schema");
const { users } = require("./users.schema");
const { cashSessions } = require("./cash_sessions.schema");

const cashReconciliations = pgTable(
  "cash_reconciliations",
  {
    id: serial("id").primaryKey(),

    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),

    cashSessionId: integer("cash_session_id")
      .notNull()
      .references(() => cashSessions.id, { onDelete: "cascade" }),

    // ✅ keep only cashier_id (real-world accountable actor)
    cashierId: integer("cashier_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    expectedCash: bigint("expected_cash", { mode: "number" }).notNull(),
    countedCash: bigint("counted_cash", { mode: "number" }).notNull(),

    // keep as a read column; DB can compute it (generated or trigger)
    difference: bigint("difference", { mode: "number" }),

    note: varchar("note", { length: 200 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqSession: uniqueIndex("cash_reconciliations_cash_session_id_unique").on(
      t.cashSessionId
    ),
  })
);

module.exports = { cashReconciliations };