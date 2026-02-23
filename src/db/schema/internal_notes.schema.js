// backend/src/db/schema/internal_notes.schema.js
const {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
} = require("drizzle-orm/pg-core");

const internalNotes = pgTable(
  "internal_notes",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),
    entityType: text("entity_type").notNull(), // 'sale' | 'credit' | 'customer'
    entityId: integer("entity_id").notNull(),
    message: text("message").notNull(),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    locEntityIdx: index("internal_notes_loc_entity_idx").on(
      t.locationId,
      t.entityType,
      t.entityId,
      t.createdAt,
    ),
    locCreatedIdx: index("internal_notes_loc_created_idx").on(
      t.locationId,
      t.createdBy,
      t.createdAt,
    ),
  }),
);

module.exports = { internalNotes };
