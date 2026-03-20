"use strict";

const { db } = require("../config/db");
const { sql, eq } = require("drizzle-orm");

const { proformas } = require("../db/schema/proformas.schema");
const { proformaItems } = require("../db/schema/proforma_items.schema");
const { safeLogAudit } = require("./auditService");
const { renderProformaHtml } = require("./printDocuments.service");

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
  return s;
}

function normalizeStatus(value) {
  return String(value || "DRAFT")
    .trim()
    .toUpperCase();
}

function normalizeCurrency(value) {
  return String(value || "RWF")
    .trim()
    .toUpperCase()
    .slice(0, 12);
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

    customerId: row.customerId == null ? null : Number(row.customerId),
    customerName: row.customerName ?? null,
    customerPhone: row.customerPhone ?? null,
    customerTin: row.customerTin ?? null,
    customerAddress: row.customerAddress ?? null,

    createdByUserId: Number(row.createdByUserId),
    createdByName: row.createdByName ?? null,
    createdByEmail: row.createdByEmail ?? null,

    proformaNo: row.proformaNo ?? null,
    status: row.status ?? "DRAFT",
    currency: row.currency ?? "RWF",
    subtotal: Number(row.subtotal || 0),
    totalAmount: Number(row.totalAmount || 0),
    validUntil: row.validUntil ?? null,
    note: row.note ?? null,
    terms: row.terms ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function createProforma({ actorUser, locationId, payload }) {
  return db.transaction(async (tx) => {
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) {
      const err = new Error("Proforma items are required");
      err.code = "BAD_ITEMS";
      throw err;
    }

    let subtotal = 0;
    const cleanItems = items.map((row) => {
      const qty = Math.max(1, toInt(row.qty, 0) || 0);
      const unitPrice = Math.max(0, toInt(row.unitPrice, 0) || 0);
      const lineTotal = qty * unitPrice;
      subtotal += lineTotal;

      return {
        productId: row.productId == null ? null : Number(row.productId),
        productName: cleanText(row.productName, 180) || "Item",
        productDisplayName:
          cleanText(row.productDisplayName, 220) ||
          cleanText(row.productName, 180) ||
          "Item",
        productSku: cleanText(row.productSku, 80),
        stockUnit: cleanText(row.stockUnit, 40) || "PIECE",
        qty,
        unitPrice,
        lineTotal,
      };
    });

    const totalAmount = subtotal;

    const [created] = await tx
      .insert(proformas)
      .values({
        locationId: Number(locationId),
        customerId:
          payload.customerId == null ? null : Number(payload.customerId),
        createdByUserId: Number(actorUser.id),

        proformaNo: cleanText(payload.proformaNo, 120),
        status: "DRAFT",

        customerName: cleanText(payload.customerName, 160),
        customerPhone: cleanText(payload.customerPhone, 40),
        customerTin: cleanText(payload.customerTin, 60),
        customerAddress: cleanText(payload.customerAddress, 2000),

        currency: normalizeCurrency(payload.currency),
        subtotal,
        totalAmount,

        validUntil: parseDateOrNull(payload.validUntil),
        note: cleanText(payload.note, 4000),
        terms: cleanText(payload.terms, 4000),

        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    for (const row of cleanItems) {
      await tx.insert(proformaItems).values({
        proformaId: Number(created.id),
        productId: row.productId,
        productName: row.productName,
        productDisplayName: row.productDisplayName,
        productSku: row.productSku,
        stockUnit: row.stockUnit,
        qty: row.qty,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
        createdAt: new Date(),
      });
    }

    await safeLogAudit({
      locationId: Number(locationId),
      userId: Number(actorUser.id),
      action: "PROFORMA_CREATE",
      entity: "proforma",
      entityId: Number(created.id),
      description: `Created proforma #${created.id}`,
      meta: {
        proformaId: Number(created.id),
        totalAmount,
        itemsCount: cleanItems.length,
      },
    });

    return getProformaById({
      proformaId: Number(created.id),
      locationId: null,
    });
  });
}

async function listProformas({
  locationId = null,
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
  const customerIdInt = toInt(customerId, null);
  const statusValue = status ? normalizeStatus(status) : null;
  const search = cleanText(q, 200);

  let where = sql`TRUE`;

  if (locationId != null) {
    where = sql`${where} AND p.location_id = ${Number(locationId)}`;
  }

  if (customerIdInt != null) {
    where = sql`${where} AND p.customer_id = ${customerIdInt}`;
  }

  if (statusValue) {
    where = sql`${where} AND p.status = ${statusValue}`;
  }

  if (cursorId != null && cursorId > 0) {
    where = sql`${where} AND p.id < ${cursorId}`;
  }

  if (from) {
    where = sql`${where} AND p.created_at >= ${from}`;
  }

  if (toExclusive) {
    where = sql`${where} AND p.created_at < ${toExclusive}`;
  }

  if (search) {
    const like = `%${search}%`;
    where = sql`${where} AND (
      CAST(p.id AS text) ILIKE ${like}
      OR COALESCE(p.proforma_no, '') ILIKE ${like}
      OR COALESCE(p.customer_name, '') ILIKE ${like}
      OR COALESCE(p.customer_phone, '') ILIKE ${like}
      OR COALESCE(p.customer_tin, '') ILIKE ${like}
      OR COALESCE(l.name, '') ILIKE ${like}
      OR COALESCE(l.code, '') ILIKE ${like}
    )`;
  }

  const res = await db.execute(sql`
    SELECT
      p.id,
      p.location_id as "locationId",
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
      p.customer_id as "customerId",
      p.customer_name as "customerName",
      p.customer_phone as "customerPhone",
      p.customer_tin as "customerTin",
      p.customer_address as "customerAddress",
      p.created_by_user_id as "createdByUserId",
      u.name as "createdByName",
      u.email as "createdByEmail",
      p.proforma_no as "proformaNo",
      p.status,
      p.currency,
      p.subtotal,
      p.total_amount as "totalAmount",
      p.valid_until as "validUntil",
      p.note,
      p.terms,
      p.created_at as "createdAt",
      p.updated_at as "updatedAt"
    FROM proformas p
    JOIN locations l ON l.id = p.location_id
    LEFT JOIN users u ON u.id = p.created_by_user_id
    WHERE ${where}
    ORDER BY p.id DESC
    LIMIT ${lim}
  `);

  const rows = (res.rows || res || []).map(mapHeader);
  const nextCursor = rows.length === lim ? rows[rows.length - 1].id : null;

  return { rows, nextCursor };
}

async function getProformaById({ proformaId, locationId = null }) {
  const id = toInt(proformaId, null);
  if (!id) return null;

  let where = sql`p.id = ${id}`;
  if (locationId != null) {
    where = sql`${where} AND p.location_id = ${Number(locationId)}`;
  }

  const headRes = await db.execute(sql`
    SELECT
      p.id,
      p.location_id as "locationId",
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
      p.customer_id as "customerId",
      p.customer_name as "customerName",
      p.customer_phone as "customerPhone",
      p.customer_tin as "customerTin",
      p.customer_address as "customerAddress",
      p.created_by_user_id as "createdByUserId",
      u.name as "createdByName",
      u.email as "createdByEmail",
      p.proforma_no as "proformaNo",
      p.status,
      p.currency,
      p.subtotal,
      p.total_amount as "totalAmount",
      p.valid_until as "validUntil",
      p.note,
      p.terms,
      p.created_at as "createdAt",
      p.updated_at as "updatedAt"
    FROM proformas p
    JOIN locations l ON l.id = p.location_id
    LEFT JOIN users u ON u.id = p.created_by_user_id
    WHERE ${where}
    LIMIT 1
  `);

  const head = (headRes.rows || headRes || [])[0];
  if (!head) return null;

  const itemsRes = await db.execute(sql`
    SELECT
      pi.id,
      pi.proforma_id as "proformaId",
      pi.product_id as "productId",
      pi.product_name as "productName",
      pi.product_display_name as "productDisplayName",
      pi.product_sku as "productSku",
      pi.stock_unit as "stockUnit",
      pi.qty,
      pi.unit_price as "unitPrice",
      pi.line_total as "lineTotal",
      pi.created_at as "createdAt"
    FROM proforma_items pi
    WHERE pi.proforma_id = ${id}
    ORDER BY pi.id ASC
  `);

  return {
    proforma: mapHeader(head),
    items: (itemsRes.rows || itemsRes || []).map((row) => ({
      id: Number(row.id),
      proformaId: Number(row.proformaId),
      productId: row.productId == null ? null : Number(row.productId),
      productName: row.productName ?? null,
      productDisplayName: row.productDisplayName ?? null,
      productSku: row.productSku ?? null,
      stockUnit: row.stockUnit ?? "PIECE",
      qty: Number(row.qty || 0),
      unitPrice: Number(row.unitPrice || 0),
      lineTotal: Number(row.lineTotal || 0),
      createdAt: row.createdAt,
    })),
  };
}

async function renderProformaDocument({ proformaId, locationId = null }) {
  const data = await getProformaById({ proformaId, locationId });
  if (!data) return null;

  return {
    ...data,
    html: renderProformaHtml({
      header: data.proforma,
      items: data.items,
    }),
  };
}

module.exports = {
  createProforma,
  listProformas,
  getProformaById,
  renderProformaDocument,
};
