const { db } = require("../config/db");
const { and, desc, eq, ne, sql } = require("drizzle-orm");

const { locations } = require("../db/schema/locations.schema");
const { users } = require("../db/schema/users.schema");
const { sales } = require("../db/schema/sales.schema");
const { payments } = require("../db/schema/payments.schema");
const { products } = require("../db/schema/products.schema");
const { cashSessions } = require("../db/schema/cash_sessions.schema");

const { safeLogAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

const LOCATION_STATUS = {
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
  ARCHIVED: "ARCHIVED",
};

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeName(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function baseLocationSelect() {
  return {
    id: locations.id,
    name: locations.name,
    code: locations.code,
    status: locations.status,
    openedAt: locations.openedAt,
    closedAt: locations.closedAt,
    archivedAt: locations.archivedAt,
    closeReason: locations.closeReason,
    updatedAt: locations.updatedAt,
  };
}

async function ensureLocationExists(locationId) {
  const id = toInt(locationId);
  if (!id) {
    const err = new Error("Invalid location");
    err.code = "INVALID_LOCATION";
    throw err;
  }

  const rows = await db
    .select(baseLocationSelect())
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);

  const location = rows[0];
  if (!location) {
    const err = new Error("Location not found");
    err.code = "LOCATION_NOT_FOUND";
    throw err;
  }

  return location;
}

async function ensureLocationCodeAvailable(code, excludeLocationId = null) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    const err = new Error("Code is required");
    err.code = "INVALID_LOCATION_CODE";
    throw err;
  }

  const rows = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.code, normalizedCode));

  const existing = rows.find((row) => row.id !== excludeLocationId);
  if (existing) {
    const err = new Error("Location code already exists");
    err.code = "DUPLICATE_LOCATION_CODE";
    throw err;
  }
}

async function hasOpenCashSession(locationId) {
  const rows = await db
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.locationId, locationId),
        eq(cashSessions.status, "OPEN"),
      ),
    )
    .limit(1);

  return !!rows[0];
}

async function buildLocationCountsMap() {
  const [userRows, salesRows, paymentRows, productRows] = await Promise.all([
    db.select({ locationId: users.locationId }).from(users),
    db.select({ locationId: sales.locationId }).from(sales),
    db.select({ locationId: payments.locationId }).from(payments),
    db.select({ locationId: products.locationId }).from(products),
  ]);

  const countsMap = new Map();

  function ensureBucket(locationId) {
    if (!countsMap.has(locationId)) {
      countsMap.set(locationId, {
        usersCount: 0,
        productsCount: 0,
        salesCount: 0,
        paymentsCount: 0,
      });
    }
    return countsMap.get(locationId);
  }

  for (const row of userRows) {
    ensureBucket(row.locationId).usersCount += 1;
  }

  for (const row of salesRows) {
    ensureBucket(row.locationId).salesCount += 1;
  }

  for (const row of paymentRows) {
    ensureBucket(row.locationId).paymentsCount += 1;
  }

  for (const row of productRows) {
    ensureBucket(row.locationId).productsCount += 1;
  }

  return countsMap;
}

async function listLocations({ status = null } = {}) {
  const query = db
    .select(baseLocationSelect())
    .from(locations)
    .orderBy(desc(locations.updatedAt), desc(locations.id));

  const locationRows = status
    ? await query.where(eq(locations.status, status))
    : await query;

  const countsMap = await buildLocationCountsMap();

  return locationRows.map((location) => ({
    ...location,
    ...(countsMap.get(location.id) || {
      usersCount: 0,
      productsCount: 0,
      salesCount: 0,
      paymentsCount: 0,
    }),
  }));
}

async function getOwnerSummary({ locationId = null }) {
  const targetLocation = locationId
    ? await ensureLocationExists(locationId)
    : null;

  const allLocations = await listLocations();

  const filtered = targetLocation
    ? allLocations.filter((row) => row.id === targetLocation.id)
    : allLocations;

  const totals = filtered.reduce(
    (acc, row) => {
      acc.usersCount += row.usersCount;
      acc.productsCount += row.productsCount;
      acc.salesCount += row.salesCount;
      acc.paymentsCount += row.paymentsCount;
      return acc;
    },
    {
      usersCount: 0,
      productsCount: 0,
      salesCount: 0,
      paymentsCount: 0,
    },
  );

  return {
    locationId: targetLocation?.id ?? null,
    location: targetLocation
      ? {
          id: targetLocation.id,
          name: targetLocation.name,
          code: targetLocation.code,
          status: targetLocation.status,
        }
      : null,
    totals,
    perLocation: allLocations,
  };
}

async function createLocation({ actorUser, data }) {
  const name = normalizeName(data.name);
  const code = normalizeCode(data.code);

  await ensureLocationCodeAvailable(code);

  const [created] = await db
    .insert(locations)
    .values({
      name,
      code,
      status: LOCATION_STATUS.ACTIVE,
      openedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: locations.id });

  await safeLogAudit({
    locationId: created.id,
    userId: actorUser.id,
    action: AUDIT.LOCATION_CREATE,
    entity: "location",
    entityId: created.id,
    description: `Created branch ${name} (${code})`,
    meta: {
      name,
      code,
      status: LOCATION_STATUS.ACTIVE,
    },
  });

  return ensureLocationExists(created.id);
}

async function updateLocation({ actorUser, locationId, data }) {
  const location = await ensureLocationExists(locationId);

  const updates = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) {
    updates.name = normalizeName(data.name);
  }

  if (data.code !== undefined) {
    const normalizedCode = normalizeCode(data.code);
    await ensureLocationCodeAvailable(normalizedCode, location.id);
    updates.code = normalizedCode;
  }

  const [updated] = await db
    .update(locations)
    .set(updates)
    .where(eq(locations.id, location.id))
    .returning({ id: locations.id });

  await safeLogAudit({
    locationId: location.id,
    userId: actorUser.id,
    action: AUDIT.LOCATION_UPDATE,
    entity: "location",
    entityId: updated.id,
    description: `Updated branch ${location.name} (${location.code})`,
    meta: {
      before: {
        name: location.name,
        code: location.code,
        status: location.status,
      },
      after: {
        name: updates.name ?? location.name,
        code: updates.code ?? location.code,
        status: location.status,
      },
    },
  });

  return ensureLocationExists(updated.id);
}

async function closeLocation({ actorUser, locationId, reason }) {
  const location = await ensureLocationExists(locationId);

  if (location.status === LOCATION_STATUS.CLOSED) {
    return location;
  }

  if (location.status === LOCATION_STATUS.ARCHIVED) {
    const err = new Error("Archived location cannot be closed");
    err.code = "INVALID_LOCATION_STATUS";
    throw err;
  }

  if (await hasOpenCashSession(location.id)) {
    const err = new Error("Location has open cash session");
    err.code = "LOCATION_HAS_OPEN_CASH_SESSION";
    throw err;
  }

  const now = new Date();

  const [updated] = await db
    .update(locations)
    .set({
      status: LOCATION_STATUS.CLOSED,
      closedAt: now,
      closeReason: String(reason || "").trim() || null,
      updatedAt: now,
    })
    .where(eq(locations.id, location.id))
    .returning({ id: locations.id });

  await safeLogAudit({
    locationId: location.id,
    userId: actorUser.id,
    action: AUDIT.LOCATION_CLOSE,
    entity: "location",
    entityId: updated.id,
    description: `Closed branch ${location.name} (${location.code})`,
    meta: {
      fromStatus: location.status,
      toStatus: LOCATION_STATUS.CLOSED,
      reason: String(reason || "").trim() || null,
    },
  });

  return ensureLocationExists(updated.id);
}

async function reopenLocation({ actorUser, locationId }) {
  const location = await ensureLocationExists(locationId);

  if (location.status === LOCATION_STATUS.ACTIVE) {
    return location;
  }

  const now = new Date();

  const [updated] = await db
    .update(locations)
    .set({
      status: LOCATION_STATUS.ACTIVE,
      closedAt: null,
      archivedAt: null,
      closeReason: null,
      updatedAt: now,
    })
    .where(eq(locations.id, location.id))
    .returning({ id: locations.id });

  await safeLogAudit({
    locationId: location.id,
    userId: actorUser.id,
    action: AUDIT.LOCATION_REOPEN,
    entity: "location",
    entityId: updated.id,
    description: `Reopened branch ${location.name} (${location.code})`,
    meta: {
      fromStatus: location.status,
      toStatus: LOCATION_STATUS.ACTIVE,
    },
  });

  return ensureLocationExists(updated.id);
}

async function archiveLocation({ actorUser, locationId, reason }) {
  const location = await ensureLocationExists(locationId);

  if (location.status === LOCATION_STATUS.ARCHIVED) {
    return location;
  }

  if (location.status === LOCATION_STATUS.ACTIVE) {
    const err = new Error("Close location before archiving");
    err.code = "LOCATION_MUST_BE_CLOSED_FIRST";
    throw err;
  }

  if (await hasOpenCashSession(location.id)) {
    const err = new Error("Location has open cash session");
    err.code = "LOCATION_HAS_OPEN_CASH_SESSION";
    throw err;
  }

  const now = new Date();

  const [updated] = await db
    .update(locations)
    .set({
      status: LOCATION_STATUS.ARCHIVED,
      archivedAt: now,
      closeReason: String(reason || "").trim() || location.closeReason || null,
      updatedAt: now,
    })
    .where(eq(locations.id, location.id))
    .returning({ id: locations.id });

  await safeLogAudit({
    locationId: location.id,
    userId: actorUser.id,
    action: AUDIT.LOCATION_ARCHIVE,
    entity: "location",
    entityId: updated.id,
    description: `Archived branch ${location.name} (${location.code})`,
    meta: {
      fromStatus: location.status,
      toStatus: LOCATION_STATUS.ARCHIVED,
      reason: String(reason || "").trim() || location.closeReason || null,
    },
  });

  return ensureLocationExists(updated.id);
}

module.exports = {
  LOCATION_STATUS,
  listLocations,
  getOwnerSummary,
  createLocation,
  updateLocation,
  closeLocation,
  reopenLocation,
  archiveLocation,
  ensureLocationExists,
};
