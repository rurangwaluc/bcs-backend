const {
  pgTable,
  bigserial,
  bigint,
  text,
  boolean,
  timestamp,
} = require("drizzle-orm/pg-core");

const notes = pgTable("notes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  locationId: bigint("location_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),

  entity: text("entity").notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(),

  body: text("body").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

module.exports = { notes };
