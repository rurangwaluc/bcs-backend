"use strict";

const {
  pgTable,
  bigserial,
  integer,
  varchar,
  text,
  timestamp,
  bigint,
  index,
} = require("drizzle-orm/pg-core");

const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    locationId: integer("location_id").notNull(),
    purchaseOrderId: bigint("purchase_order_id", { mode: "number" }).notNull(),
    supplierId: integer("supplier_id").notNull(),

    receiptNo: varchar("receipt_no", { length: 120 }),
    reference: varchar("reference", { length: 120 }),
    note: text("note"),

    receivedByUserId: integer("received_by_user_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    totalLines: integer("total_lines").notNull().default(0),
    totalUnitsReceived: integer("total_units_received").notNull().default(0),
    totalAmount: bigint("total_amount", { mode: "number" })
      .notNull()
      .default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    locationCreatedIdx: index("idx_goods_receipts_location_created").on(
      t.locationId,
      t.createdAt,
    ),
    poIdx: index("idx_goods_receipts_po_id").on(t.purchaseOrderId),
  }),
);

module.exports = { goodsReceipts };
