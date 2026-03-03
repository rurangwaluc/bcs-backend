const { db } = require("../config/db");
const { users } = require("../db/schema/users.schema");
const { locations } = require("../db/schema/locations.schema"); // ✅ NEW
const { hashPassword } = require("../utils/password");
const { eq, and } = require("drizzle-orm");
const ROLES = require("../permissions/roles");
const { safeLogAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

function isOwner(adminUser) {
  return adminUser?.role === ROLES.OWNER;
}

function userSelectWithLocation() {
  return {
    id: users.id,
    locationId: users.locationId,
    name: users.name,
    email: users.email,
    role: users.role,
    isActive: users.isActive,
    createdAt: users.createdAt,
    lastSeenAt: users.lastSeenAt,

    // ✅ NEW: nested location object
    location: {
      id: locations.id,
      name: locations.name,
      code: locations.code,
    },
  };
}

function normalizeUserRow(row) {
  // If join fails (no matching location), return location: null
  const loc = row?.location;
  const hasLoc = loc && loc.id != null;
  return { ...row, location: hasLoc ? loc : null };
}

async function getUserByIdWithLocation({ adminUser, userId }) {
  const rows = await db
    .select(userSelectWithLocation())
    .from(users)
    .leftJoin(locations, eq(locations.id, users.locationId))
    .where(and(eq(users.id, userId), eq(users.locationId, adminUser.locationId)))
    .limit(1);

  return rows[0] ? normalizeUserRow(rows[0]) : null;
}

async function locationHasOwner(locationId) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.locationId, locationId), eq(users.role, ROLES.OWNER)))
    .limit(1);

  return !!rows[0];
}

async function createUser({ adminUser, data }) {
  if (data.role === ROLES.OWNER) {
    const hasOwner = await locationHasOwner(adminUser.locationId);
    if (hasOwner && !isOwner(adminUser)) {
      const err = new Error("Only owner can create owner users");
      err.code = "OWNER_ONLY";
      throw err;
    }
  }

  const passwordHash = hashPassword(data.password);

  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.locationId, adminUser.locationId), eq(users.email, data.email)));

  if (existing[0]) {
    const err = new Error("Email already exists");
    err.code = "DUPLICATE_EMAIL";
    throw err;
  }

  const [created] = await db
    .insert(users)
    .values({
      locationId: adminUser.locationId,
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      isActive: data.isActive ?? true,
      lastSeenAt: null,
    })
    .returning({ id: users.id });

  await safeLogAudit({
    locationId: adminUser.locationId,
    userId: adminUser.id,
    action: AUDIT.USER_CREATE,
    entity: "user",
    entityId: created.id,
    description: `Created user ${data.email} role=${data.role}`,
    meta: { role: data.role, isActive: data.isActive ?? true },
  });

  // ✅ Return enriched user (with location)
  const enriched = await getUserByIdWithLocation({ adminUser, userId: created.id });
  return enriched;
}

async function listUsers({ adminUser }) {
  const rows = await db
    .select(userSelectWithLocation())
    .from(users)
    .leftJoin(locations, eq(locations.id, users.locationId))
    .where(eq(users.locationId, adminUser.locationId));

  return rows.map(normalizeUserRow);
}

async function updateUser({ adminUser, targetUserId, data }) {
  if (adminUser.id === targetUserId && data.isActive === false) {
    const err = new Error("Admin cannot deactivate self");
    err.code = "CANNOT_DEACTIVATE_SELF";
    throw err;
  }

  if (data.role === ROLES.OWNER && !isOwner(adminUser)) {
    const err = new Error("Only owner can promote someone to owner");
    err.code = "OWNER_ONLY";
    throw err;
  }

  const target = await db
    .select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive, email: users.email })
    .from(users)
    .where(and(eq(users.id, targetUserId), eq(users.locationId, adminUser.locationId)))
    .limit(1);

  if (!target[0]) {
    const err = new Error("User not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  const before = target[0];

  const updates = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.role !== undefined) updates.role = data.role;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(and(eq(users.id, targetUserId), eq(users.locationId, adminUser.locationId)))
    .returning({ id: users.id });

  const changes = {};
  if (data.name !== undefined) changes.name = { from: before.name, to: data.name };
  if (data.role !== undefined) changes.role = { from: before.role, to: data.role };
  if (data.isActive !== undefined) changes.isActive = { from: before.isActive, to: data.isActive };

  await safeLogAudit({
    locationId: adminUser.locationId,
    userId: adminUser.id,
    action: AUDIT.USER_UPDATE,
    entity: "user",
    entityId: updated.id,
    description: `Updated user ${before.email}`,
    meta: changes,
  });

  // ✅ Return enriched user (with location)
  const enriched = await getUserByIdWithLocation({ adminUser, userId: updated.id });
  return enriched;
}

async function deactivateUser({ adminUser, targetUserId }) {
  if (adminUser.id === targetUserId) {
    const err = new Error("Admin cannot deactivate self");
    err.code = "CANNOT_DEACTIVATE_SELF";
    throw err;
  }

  const target = await db
    .select({ id: users.id, isActive: users.isActive, role: users.role, email: users.email })
    .from(users)
    .where(and(eq(users.id, targetUserId), eq(users.locationId, adminUser.locationId)))
    .limit(1);

  if (!target[0]) {
    const err = new Error("User not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  const before = target[0];

  if (before.role === ROLES.OWNER && !isOwner(adminUser)) {
    const err = new Error("Only owner can deactivate owner users");
    err.code = "OWNER_ONLY";
    throw err;
  }

  if (!before.isActive) {
    const enriched = await getUserByIdWithLocation({ adminUser, userId: before.id });
    return enriched;
  }

  const [updated] = await db
    .update(users)
    .set({ isActive: false })
    .where(and(eq(users.id, targetUserId), eq(users.locationId, adminUser.locationId)))
    .returning({ id: users.id });

  await safeLogAudit({
    locationId: adminUser.locationId,
    userId: adminUser.id,
    action: AUDIT.USER_DEACTIVATE,
    entity: "user",
    entityId: updated.id,
    description: `Deactivated user ${before.email}`,
    meta: { from: true, to: false },
  });

  // ✅ Return enriched user (with location)
  const enriched = await getUserByIdWithLocation({ adminUser, userId: updated.id });
  return enriched;
}

module.exports = { createUser, listUsers, updateUser, deactivateUser };