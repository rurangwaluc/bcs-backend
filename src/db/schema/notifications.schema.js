// backend/src/db/schema/notifications.schema.js
const {
  pgTable,
  bigserial,
  integer,
  text,
  boolean,
  timestamp,
  varchar,
  index,
} = require("drizzle-orm/pg-core");

const notifications = pgTable(
  "notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    locationId: integer("location_id").notNull(),
    recipientUserId: integer("recipient_user_id").notNull(),
    actorUserId: integer("actor_user_id"),

    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),

    // normal | high | warn
    priority: varchar("priority", { length: 20 }).notNull().default("normal"),

    entity: text("entity"),
    entityId: integer("entity_id"),

    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    recipientUnreadIdx: index("notifications_recipient_unread_idx").on(
      t.recipientUserId,
      t.isRead,
      t.createdAt,
    ),
    locationCreatedIdx: index("notifications_location_created_idx").on(
      t.locationId,
      t.createdAt,
    ),
  }),
);

module.exports = { notifications };
