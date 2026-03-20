"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

const { deliveryNotes } = require("../db/schema/delivery_notes.schema");
const {
  deliveryNoteItems,
} = require("../db/schema/delivery_note_items.schema");
const { sales } = require("../db/schema/sales.schema");
const { saleItems } = require("../db/schema/sale_items.schema");
const { customers } = require("../db/schema/customers.schema");
const { safeLogAudit } = require("./auditService");
const { renderDeliveryNoteHtml } = require("./printDocuments.service");

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(Math.max(Math.trunc(x), min), max);
}

function toInt(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanText(value, max = 255) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseDateOrNull(value) {
  const s = cleanText(value, 80);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function mapHeader(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    locationId: Number(row.locationId),
    locationName: row.locationName ?? null,
    locationCode: row.locationCode ?? null,
    locationEmail: row.locationEmail ?? null,
    locationPhone: row.locationPhone ?? null,
    locationWebsite: row.locationWebsite ?? null,
    locationLogoUrl: row.locationLogoUrl ?? null,
    locationAddress: row.locationAddress ?? null,
    locationTin: row.locationTin ?? null,
    locationMomoCode: row.locationMomoCode ?? null,
    locationBankAccounts: Array.isArray(row.locationBankAccounts)
      ? row.locationBankAccounts
      : [],

    saleId: Number(row.saleId),
    customerId: row.customerId == null ? null : Number(row.customerId),
    customerName: row.customerName ?? null,
    customerPhone: row.customerPhone ?? null,
    customerTin: row.customerTin ?? null,
    customerAddress: row.customerAddress ?? null,

    createdByUserId: Number(row.createdByUserId),
    createdByName: row.createdByName ?? null,
    createdByEmail: row.createdByEmail ?? null,

    deliveryNoteNo: row.deliveryNoteNo ?? null,
    status: row.status ?? "ISSUED",
    deliveredTo: row.deliveredTo ?? null,
    deliveredPhone: row.deliveredPhone ?? null,
    dispatchedAt: row.dispatchedAt ?? null,
    deliveredAt: row.deliveredAt ?? null,
    note: row.note ?? null,
    totalItems: Number(row.totalItems || 0),
    totalQty: Number(row.totalQty || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function createDeliveryNote({ actorUser, locationId, payload }) {
  return db.transaction(async (tx) => {
    const saleId = Number(payload.saleId);

    const saleRes = await tx.execute(sql`
      SELECT
        s.id,
        s.location_id as "locationId",
        s.customer_id as "customerId",
        s.customer_name as "customerName",
        s.customer_phone as "customerPhone",
        s.status
      FROM sales s
      WHERE s.id = ${saleId}
        AND s.location_id = ${Number(locationId)}
      LIMIT 1
    `);

    const sale = (saleRes.rows || saleRes || [])[0];
    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    const saleStatus = String(sale.status || "")
      .trim()
      .toUpperCase();
    if (!["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(saleStatus)) {
      const err = new Error(
        "Delivery note can only be issued for completed/fulfilled sale records",
      );
      err.code = "BAD_STATUS";
      throw err;
    }

    const existingRes = await tx.execute(sql`
      SELECT id
      FROM delivery_notes
      WHERE sale_id = ${saleId}
        AND location_id = ${Number(locationId)}
        AND status <> 'CANCELLED'
      LIMIT 1
    `);

    const existing = (existingRes.rows || existingRes || [])[0];
    if (existing) {
      const err = new Error("Delivery note already exists for this sale");
      err.code = "ALREADY_EXISTS";
      throw err;
    }

    const saleItemsRes = await tx.execute(sql`
      SELECT
        si.id,
        si.product_id as "productId",
        si.product_name as "productName",
        si.product_display_name as "productDisplayName",
        si.product_sku as "productSku",
        si.stock_unit as "stockUnit",
        si.qty
      FROM sale_items si
      WHERE si.sale_id = ${saleId}
      ORDER BY si.id ASC
    `);

    const items = saleItemsRes.rows || saleItemsRes || [];
    if (!items.length) {
      const err = new Error("Sale has no items");
      err.code = "BAD_ITEMS";
      throw err;
    }

    let customerTin = null;
    let customerAddress = null;

    if (sale.customerId) {
      const customerRes = await tx.execute(sql`
        SELECT tin, address
        FROM customers
        WHERE id = ${Number(sale.customerId)}
        LIMIT 1
      `);

      const customer = (customerRes.rows || customerRes || [])[0];
      customerTin = customer?.tin ?? null;
      customerAddress = customer?.address ?? null;
    }

    const totalItems = items.length;
    const totalQty = items.reduce((sum, row) => sum + Number(row.qty || 0), 0);

    const [created] = await tx
      .insert(deliveryNotes)
      .values({
        locationId: Number(locationId),
        saleId,
        customerId: sale.customerId == null ? null : Number(sale.customerId),
        createdByUserId: Number(actorUser.id),

        deliveryNoteNo: cleanText(payload.deliveryNoteNo, 120),
        status: "ISSUED",

        customerName: cleanText(sale.customerName, 160),
        customerPhone: cleanText(sale.customerPhone, 40),
        customerTin: cleanText(customerTin, 60),
        customerAddress: cleanText(customerAddress, 2000),

        deliveredTo: cleanText(payload.deliveredTo, 160),
        deliveredPhone: cleanText(payload.deliveredPhone, 40),
        dispatchedAt: parseDateOrNull(payload.dispatchedAt) || new Date(),
        deliveredAt: parseDateOrNull(payload.deliveredAt),
        note: cleanText(payload.note, 4000),

        totalItems,
        totalQty,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    for (const row of items) {
      await tx.insert(deliveryNoteItems).values({
        deliveryNoteId: Number(created.id),
        saleItemId: Number(row.id),
        productId: row.productId == null ? null : Number(row.productId),
        productName: cleanText(row.productName, 180) || "Item",
        productDisplayName:
          cleanText(row.productDisplayName, 220) ||
          cleanText(row.productName, 180) ||
          "Item",
        productSku: cleanText(row.productSku, 80),
        stockUnit: cleanText(row.stockUnit, 40) || "PIECE",
        qty: Number(row.qty || 0),
        createdAt: new Date(),
      });
    }

    await safeLogAudit({
      locationId: Number(locationId),
      userId: Number(actorUser.id),
      action: "DELIVERY_NOTE_CREATE",
      entity: "delivery_note",
      entityId: Number(created.id),
      description: `Created delivery note #${created.id} for sale #${saleId}`,
      meta: {
        deliveryNoteId: Number(created.id),
        saleId,
        totalItems,
        totalQty,
      },
    });

    return getDeliveryNoteById({
      deliveryNoteId: Number(created.id),
      locationId: null,
    });
  });
}

async function listDeliveryNotes({
  locationId = null,
  saleId = null,
  customerId = null,
  status = null,
  q = null,
  from = null,
  toExclusive = null,
  limit = 50,
  cursor = null,
}) {
  const lim = clampInt(limit, 1, 200, 50);
  const cursorId = toInt(cursor, null);
  const saleIdInt = toInt(saleId, null);
  const customerIdInt = toInt(customerId, null);
  const statusValue = cleanText(status, 30);
  const search = cleanText(q, 200);

  let where = sql`TRUE`;

  if (locationId != null) {
    where = sql`${where} AND dn.location_id = ${Number(locationId)}`;
  }

  if (saleIdInt != null) {
    where = sql`${where} AND dn.sale_id = ${saleIdInt}`;
  }

  if (customerIdInt != null) {
    where = sql`${where} AND dn.customer_id = ${customerIdInt}`;
  }

  if (statusValue) {
    where = sql`${where} AND dn.status = ${statusValue}`;
  }

  if (cursorId != null && cursorId > 0) {
    where = sql`${where} AND dn.id < ${cursorId}`;
  }

  if (from) {
    where = sql`${where} AND dn.created_at >= ${from}`;
  }

  if (toExclusive) {
    where = sql`${where} AND dn.created_at < ${toExclusive}`;
  }

  if (search) {
    const like = `%${search}%`;
    where = sql`${where} AND (
      CAST(dn.id AS text) ILIKE ${like}
      OR CAST(dn.sale_id AS text) ILIKE ${like}
      OR COALESCE(dn.delivery_note_no, '') ILIKE ${like}
      OR COALESCE(dn.customer_name, '') ILIKE ${like}
      OR COALESCE(dn.customer_phone, '') ILIKE ${like}
      OR COALESCE(dn.delivered_to, '') ILIKE ${like}
      OR COALESCE(l.name, '') ILIKE ${like}
      OR COALESCE(l.code, '') ILIKE ${like}
    )`;
  }

  const res = await db.execute(sql`
    SELECT
      dn.id,
      dn.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.email as "locationEmail",
      l.phone as "locationPhone",
      l.website as "locationWebsite",
      l.logo_url as "locationLogoUrl",
      l.address as "locationAddress",
      l.tin as "locationTin",
      l.momo_code as "locationMomoCode",
      l.bank_accounts as "locationBankAccounts",
      dn.sale_id as "saleId",
      dn.customer_id as "customerId",
      dn.customer_name as "customerName",
      dn.customer_phone as "customerPhone",
      dn.customer_tin as "customerTin",
      dn.customer_address as "customerAddress",
      dn.created_by_user_id as "createdByUserId",
      u.name as "createdByName",
      u.email as "createdByEmail",
      dn.delivery_note_no as "deliveryNoteNo",
      dn.status,
      dn.delivered_to as "deliveredTo",
      dn.delivered_phone as "deliveredPhone",
      dn.dispatched_at as "dispatchedAt",
      dn.delivered_at as "deliveredAt",
      dn.note,
      dn.total_items as "totalItems",
      dn.total_qty as "totalQty",
      dn.created_at as "createdAt",
      dn.updated_at as "updatedAt"
    FROM delivery_notes dn
    JOIN locations l ON l.id = dn.location_id
    LEFT JOIN users u ON u.id = dn.created_by_user_id
    WHERE ${where}
    ORDER BY dn.id DESC
    LIMIT ${lim}
  `);

  const rows = (res.rows || res || []).map(mapHeader);
  const nextCursor = rows.length === lim ? rows[rows.length - 1].id : null;

  return { rows, nextCursor };
}

async function getDeliveryNoteById({ deliveryNoteId, locationId = null }) {
  const id = toInt(deliveryNoteId, null);
  if (!id) return null;

  let where = sql`dn.id = ${id}`;
  if (locationId != null) {
    where = sql`${where} AND dn.location_id = ${Number(locationId)}`;
  }

  const headRes = await db.execute(sql`
    SELECT
      dn.id,
      dn.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.email as "locationEmail",
      l.phone as "locationPhone",
      l.website as "locationWebsite",
      l.logo_url as "locationLogoUrl",
      l.address as "locationAddress",
      l.tin as "locationTin",
      l.momo_code as "locationMomoCode",
      l.bank_accounts as "locationBankAccounts",
      dn.sale_id as "saleId",
      dn.customer_id as "customerId",
      dn.customer_name as "customerName",
      dn.customer_phone as "customerPhone",
      dn.customer_tin as "customerTin",
      dn.customer_address as "customerAddress",
      dn.created_by_user_id as "createdByUserId",
      u.name as "createdByName",
      u.email as "createdByEmail",
      dn.delivery_note_no as "deliveryNoteNo",
      dn.status,
      dn.delivered_to as "deliveredTo",
      dn.delivered_phone as "deliveredPhone",
      dn.dispatched_at as "dispatchedAt",
      dn.delivered_at as "deliveredAt",
      dn.note,
      dn.total_items as "totalItems",
      dn.total_qty as "totalQty",
      dn.created_at as "createdAt",
      dn.updated_at as "updatedAt"
    FROM delivery_notes dn
    JOIN locations l ON l.id = dn.location_id
    LEFT JOIN users u ON u.id = dn.created_by_user_id
    WHERE ${where}
    LIMIT 1
  `);

  const head = (headRes.rows || headRes || [])[0];
  if (!head) return null;

  const itemsRes = await db.execute(sql`
    SELECT
      dni.id,
      dni.delivery_note_id as "deliveryNoteId",
      dni.sale_item_id as "saleItemId",
      dni.product_id as "productId",
      dni.product_name as "productName",
      dni.product_display_name as "productDisplayName",
      dni.product_sku as "productSku",
      dni.stock_unit as "stockUnit",
      dni.qty,
      dni.created_at as "createdAt"
    FROM delivery_note_items dni
    WHERE dni.delivery_note_id = ${id}
    ORDER BY dni.id ASC
  `);

  return {
    deliveryNote: mapHeader(head),
    items: (itemsRes.rows || itemsRes || []).map((row) => ({
      id: Number(row.id),
      deliveryNoteId: Number(row.deliveryNoteId),
      saleItemId: row.saleItemId == null ? null : Number(row.saleItemId),
      productId: row.productId == null ? null : Number(row.productId),
      productName: row.productName ?? null,
      productDisplayName: row.productDisplayName ?? null,
      productSku: row.productSku ?? null,
      stockUnit: row.stockUnit ?? "PIECE",
      qty: Number(row.qty || 0),
      createdAt: row.createdAt,
    })),
  };
}

async function renderDeliveryNoteDocument({
  deliveryNoteId,
  locationId = null,
}) {
  const data = await getDeliveryNoteById({ deliveryNoteId, locationId });
  if (!data) return null;

  return {
    ...data,
    html: renderDeliveryNoteHtml({
      header: data.deliveryNote,
      items: data.items,
    }),
  };
}

module.exports = {
  createDeliveryNote,
  listDeliveryNotes,
  getDeliveryNoteById,
  renderDeliveryNoteDocument,
};
