"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");
const { suppliers } = require("../db/schema/suppliers.schema");

function toInt(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function cleanStr(v) {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

function normalizeSourceType(v) {
  const s = String(v || "LOCAL")
    .trim()
    .toUpperCase();
  return s === "ABROAD" ? "ABROAD" : "LOCAL";
}

function normalizeCurrency(v) {
  const s = String(v || "RWF")
    .trim()
    .toUpperCase();
  return s === "USD" ? "USD" : "RWF";
}

function normalizeBool(v, def = true) {
  if (v === true || v === false) return v;
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return def;
}

function buildCreatePayload(payload = {}) {
  const name = cleanStr(payload.name);
  if (!name || name.length < 2) {
    const err = new Error("Supplier name must be at least 2 characters");
    err.statusCode = 400;
    throw err;
  }

  return {
    name,
    contactName: cleanStr(payload.contactName),
    phone: cleanStr(payload.phone),
    email: cleanStr(payload.email),
    country: cleanStr(payload.country),
    city: cleanStr(payload.city),
    sourceType: normalizeSourceType(payload.sourceType),
    defaultCurrency: normalizeCurrency(payload.defaultCurrency),
    address: cleanStr(payload.address),
    notes: cleanStr(payload.notes),
    isActive: normalizeBool(payload.isActive, true),
  };
}

function buildUpdatePayload(payload = {}) {
  const patch = {};

  if (payload.name !== undefined) {
    const name = cleanStr(payload.name);
    if (!name || name.length < 2) {
      const err = new Error("Supplier name must be at least 2 characters");
      err.statusCode = 400;
      throw err;
    }
    patch.name = name;
  }

  if (payload.contactName !== undefined)
    patch.contactName = cleanStr(payload.contactName);
  if (payload.phone !== undefined) patch.phone = cleanStr(payload.phone);
  if (payload.email !== undefined) patch.email = cleanStr(payload.email);
  if (payload.country !== undefined) patch.country = cleanStr(payload.country);
  if (payload.city !== undefined) patch.city = cleanStr(payload.city);
  if (payload.sourceType !== undefined)
    patch.sourceType = normalizeSourceType(payload.sourceType);
  if (payload.defaultCurrency !== undefined)
    patch.defaultCurrency = normalizeCurrency(payload.defaultCurrency);
  if (payload.address !== undefined) patch.address = cleanStr(payload.address);
  if (payload.notes !== undefined) patch.notes = cleanStr(payload.notes);
  if (payload.isActive !== undefined)
    patch.isActive = normalizeBool(payload.isActive, true);

  if (Object.keys(patch).length === 0) {
    const err = new Error("Provide at least one field to update");
    err.statusCode = 400;
    throw err;
  }

  return patch;
}

async function getSupplierOrThrow(id, tx = db) {
  const supplierId = toInt(id, null);
  if (!supplierId || supplierId <= 0) {
    const err = new Error("Invalid supplier id");
    err.statusCode = 400;
    throw err;
  }

  const rows = await tx
    .select()
    .from(suppliers)
    .where(sql`${suppliers.id} = ${supplierId}`)
    .limit(1);

  const row = rows?.[0] || null;
  if (!row) {
    const err = new Error("Supplier not found");
    err.statusCode = 404;
    throw err;
  }

  return row;
}

async function createOwnerSupplier({ actorUser, payload }) {
  const data = buildCreatePayload(payload);

  const rows = await db
    .insert(suppliers)
    .values({
      name: data.name,
      contactName: data.contactName,
      phone: data.phone,
      email: data.email,
      country: data.country,
      city: data.city,
      sourceType: data.sourceType,
      defaultCurrency: data.defaultCurrency,
      address: data.address,
      notes: data.notes,
      isActive: data.isActive,
      updatedAt: new Date(),
    })
    .returning();

  const created = rows?.[0] || null;

  if (created?.id && actorUser?.id) {
    await db
      .execute(
        sql`
      INSERT INTO audit_logs (
        location_id,
        user_id,
        action,
        entity,
        entity_id,
        description,
        created_at
      )
      VALUES (
        ${actorUser.locationId || 1},
        ${actorUser.id},
        'SUPPLIER_CREATE',
        'supplier',
        ${created.id},
        ${`Created supplier ${created.name}`},
        NOW()
      )
    `,
      )
      .catch(() => null);
  }

  return created;
}

async function updateOwnerSupplier({ id, actorUser, payload }) {
  await getSupplierOrThrow(id);

  const patch = buildUpdatePayload(payload);

  const rows = await db
    .update(suppliers)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(sql`${suppliers.id} = ${toInt(id)}`)
    .returning();

  const updated = rows?.[0] || null;

  if (updated?.id && actorUser?.id) {
    await db
      .execute(
        sql`
      INSERT INTO audit_logs (
        location_id,
        user_id,
        action,
        entity,
        entity_id,
        description,
        created_at
      )
      VALUES (
        ${actorUser.locationId || 1},
        ${actorUser.id},
        'SUPPLIER_UPDATE',
        'supplier',
        ${updated.id},
        ${`Updated supplier ${updated.name}`},
        NOW()
      )
    `,
      )
      .catch(() => null);
  }

  return updated;
}

async function deactivateOwnerSupplier({ id, actorUser, reason }) {
  const current = await getSupplierOrThrow(id);
  if (current.isActive === false) return current;

  const rows = await db
    .update(suppliers)
    .set({
      isActive: false,
      notes: cleanStr(reason)
        ? `${cleanStr(current.notes) ? `${cleanStr(current.notes)}\n` : ""}[DEACTIVATED] ${cleanStr(reason)}`
        : current.notes,
      updatedAt: new Date(),
    })
    .where(sql`${suppliers.id} = ${toInt(id)}`)
    .returning();

  const updated = rows?.[0] || null;

  if (updated?.id && actorUser?.id) {
    await db
      .execute(
        sql`
      INSERT INTO audit_logs (
        location_id,
        user_id,
        action,
        entity,
        entity_id,
        description,
        created_at
      )
      VALUES (
        ${actorUser.locationId || 1},
        ${actorUser.id},
        'SUPPLIER_DEACTIVATE',
        'supplier',
        ${updated.id},
        ${`Deactivated supplier ${updated.name}`},
        NOW()
      )
    `,
      )
      .catch(() => null);
  }

  return updated;
}

async function reactivateOwnerSupplier({ id, actorUser }) {
  const current = await getSupplierOrThrow(id);
  if (current.isActive === true) return current;

  const rows = await db
    .update(suppliers)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(sql`${suppliers.id} = ${toInt(id)}`)
    .returning();

  const updated = rows?.[0] || null;

  if (updated?.id && actorUser?.id) {
    await db
      .execute(
        sql`
      INSERT INTO audit_logs (
        location_id,
        user_id,
        action,
        entity,
        entity_id,
        description,
        created_at
      )
      VALUES (
        ${actorUser.locationId || 1},
        ${actorUser.id},
        'SUPPLIER_REACTIVATE',
        'supplier',
        ${updated.id},
        ${`Reactivated supplier ${updated.name}`},
        NOW()
      )
    `,
      )
      .catch(() => null);
  }

  return updated;
}

module.exports = {
  createOwnerSupplier,
  updateOwnerSupplier,
  deactivateOwnerSupplier,
  reactivateOwnerSupplier,
};
