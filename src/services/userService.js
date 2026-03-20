const { db } = require("../config/db");
const { users } = require("../db/schema/users.schema");
const { locations } = require("../db/schema/locations.schema");
const { hashPassword } = require("../utils/password");
const { eq, and, desc } = require("drizzle-orm");
const ROLES = require("../permissions/roles");
const { safeLogAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

function isOwner(user) {
  return String(user?.role || "").toLowerCase() === ROLES.OWNER;
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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
    location: {
      id: locations.id,
      name: locations.name,
      code: locations.code,
      status: locations.status,
    },
  };
}

function normalizeUserRow(row) {
  const loc = row?.location;
  const hasLoc = loc && loc.id != null;

  return {
    ...row,
    location: hasLoc ? loc : null,
  };
}

async function getLocationOrThrow(locationId) {
  const id = toInt(locationId);
  if (!id) {
    const err = new Error("Invalid location");
    err.code = "INVALID_LOCATION";
    throw err;
  }

  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      status: locations.status,
    })
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

async function ensureAssignableLocation(locationId) {
  const location = await getLocationOrThrow(locationId);

  if (location.status !== "ACTIVE") {
    const err = new Error("Location is not active");
    err.code = "LOCATION_NOT_ACTIVE";
    throw err;
  }

  return location;
}

async function getUserByIdWithLocationForActor({ actorUser, userId }) {
  const id = toInt(userId);
  if (!id) return null;

  const query = db
    .select(userSelectWithLocation())
    .from(users)
    .leftJoin(locations, eq(locations.id, users.locationId));

  const rows = isOwner(actorUser)
    ? await query.where(eq(users.id, id)).limit(1)
    : await query
        .where(
          and(eq(users.id, id), eq(users.locationId, actorUser.locationId)),
        )
        .limit(1);

  return rows[0] ? normalizeUserRow(rows[0]) : null;
}

async function getRawUserForActor({ actorUser, userId }) {
  const id = toInt(userId);
  if (!id) return null;

  const query = db
    .select({
      id: users.id,
      locationId: users.locationId,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users);

  const rows = isOwner(actorUser)
    ? await query.where(eq(users.id, id)).limit(1)
    : await query
        .where(
          and(eq(users.id, id), eq(users.locationId, actorUser.locationId)),
        )
        .limit(1);

  return rows[0] || null;
}

async function locationHasOwner(locationId) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.locationId, locationId), eq(users.role, ROLES.OWNER)))
    .limit(1);

  return !!rows[0];
}

function resolveCreateLocationId({ actorUser, data }) {
  if (isOwner(actorUser)) {
    const targetLocationId = toInt(data.locationId);
    if (!targetLocationId) {
      const err = new Error("Owner must choose a location");
      err.code = "LOCATION_REQUIRED";
      throw err;
    }
    return targetLocationId;
  }

  return actorUser.locationId;
}

function resolveUpdateLocationId({ actorUser, data, targetUser }) {
  if (data.locationId === undefined) {
    return targetUser.locationId;
  }

  if (!isOwner(actorUser)) {
    const err = new Error("Only owner can move users across locations");
    err.code = "LOCATION_CHANGE_FORBIDDEN";
    throw err;
  }

  const targetLocationId = toInt(data.locationId);
  if (!targetLocationId) {
    const err = new Error("Invalid location");
    err.code = "INVALID_LOCATION";
    throw err;
  }

  return targetLocationId;
}

async function ensureEmailAvailableInLocation(
  email,
  locationId,
  excludeUserId = null,
) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalizedEmail) {
    const err = new Error("Email is required");
    err.code = "INVALID_EMAIL";
    throw err;
  }

  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(eq(users.locationId, locationId), eq(users.email, normalizedEmail)),
    );

  const existing = rows.find((row) => row.id !== excludeUserId);

  if (existing) {
    const err = new Error("Email already exists in this branch");
    err.code = "DUPLICATE_EMAIL";
    throw err;
  }
}

async function createUser({ adminUser, data }) {
  const targetLocationId = resolveCreateLocationId({
    actorUser: adminUser,
    data,
  });

  await ensureAssignableLocation(targetLocationId);
  await ensureEmailAvailableInLocation(data.email, targetLocationId);

  if (data.role === ROLES.OWNER) {
    const hasOwner = await locationHasOwner(targetLocationId);
    if (hasOwner && !isOwner(adminUser)) {
      const err = new Error("Only owner can create owner users");
      err.code = "OWNER_ONLY";
      throw err;
    }
    if (!isOwner(adminUser)) {
      const err = new Error("Only owner can create owner users");
      err.code = "OWNER_ONLY";
      throw err;
    }
  }

  const passwordHash = hashPassword(data.password);

  const [created] = await db
    .insert(users)
    .values({
      locationId: targetLocationId,
      name: String(data.name).trim(),
      email: String(data.email).trim().toLowerCase(),
      passwordHash,
      role: data.role,
      isActive: data.isActive ?? true,
      lastSeenAt: null,
    })
    .returning({ id: users.id });

  await safeLogAudit({
    locationId: targetLocationId,
    userId: adminUser.id,
    action: AUDIT.USER_CREATE,
    entity: "user",
    entityId: created.id,
    description: `Created user ${String(data.email).trim().toLowerCase()} role=${data.role}`,
    meta: {
      role: data.role,
      isActive: data.isActive ?? true,
      locationId: targetLocationId,
    },
  });

  return getUserByIdWithLocationForActor({
    actorUser: adminUser,
    userId: created.id,
  });
}

async function listUsers({ adminUser }) {
  const query = db
    .select(userSelectWithLocation())
    .from(users)
    .leftJoin(locations, eq(locations.id, users.locationId));

  const rows = isOwner(adminUser)
    ? await query.orderBy(desc(users.createdAt), desc(users.id))
    : await query
        .where(eq(users.locationId, adminUser.locationId))
        .orderBy(desc(users.createdAt), desc(users.id));

  return rows.map(normalizeUserRow);
}

async function updateUser({ adminUser, targetUserId, data }) {
  if (adminUser.id === targetUserId && data.isActive === false) {
    const err = new Error("Admin cannot deactivate self");
    err.code = "CANNOT_DEACTIVATE_SELF";
    throw err;
  }

  const before = await getRawUserForActor({
    actorUser: adminUser,
    userId: targetUserId,
  });

  if (!before) {
    const err = new Error("User not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  if (data.role === ROLES.OWNER && !isOwner(adminUser)) {
    const err = new Error("Only owner can promote someone to owner");
    err.code = "OWNER_ONLY";
    throw err;
  }

  if (before.role === ROLES.OWNER && !isOwner(adminUser)) {
    const err = new Error("Only owner can modify owner users");
    err.code = "OWNER_ONLY";
    throw err;
  }

  const nextLocationId = resolveUpdateLocationId({
    actorUser: adminUser,
    data,
    targetUser: before,
  });

  if (nextLocationId !== before.locationId) {
    await ensureAssignableLocation(nextLocationId);
  }

  const nextEmail = String(before.email || "")
    .trim()
    .toLowerCase();
  await ensureEmailAvailableInLocation(nextEmail, nextLocationId, before.id);

  const updates = {};
  if (data.name !== undefined) updates.name = String(data.name).trim();
  if (data.role !== undefined) updates.role = data.role;
  if (data.isActive !== undefined) updates.isActive = data.isActive;
  if (nextLocationId !== before.locationId) updates.locationId = nextLocationId;

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, targetUserId))
    .returning({ id: users.id });

  const changes = {};
  if (data.name !== undefined) {
    changes.name = { from: before.name, to: String(data.name).trim() };
  }
  if (data.role !== undefined) {
    changes.role = { from: before.role, to: data.role };
  }
  if (data.isActive !== undefined) {
    changes.isActive = { from: before.isActive, to: data.isActive };
  }
  if (nextLocationId !== before.locationId) {
    changes.locationId = { from: before.locationId, to: nextLocationId };
  }

  await safeLogAudit({
    locationId: nextLocationId,
    userId: adminUser.id,
    action: AUDIT.USER_UPDATE,
    entity: "user",
    entityId: updated.id,
    description: `Updated user ${before.email}`,
    meta: changes,
  });

  return getUserByIdWithLocationForActor({
    actorUser: adminUser,
    userId: updated.id,
  });
}

async function deactivateUser({ adminUser, targetUserId }) {
  if (adminUser.id === targetUserId) {
    const err = new Error("Admin cannot deactivate self");
    err.code = "CANNOT_DEACTIVATE_SELF";
    throw err;
  }

  const before = await getRawUserForActor({
    actorUser: adminUser,
    userId: targetUserId,
  });

  if (!before) {
    const err = new Error("User not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  if (before.role === ROLES.OWNER && !isOwner(adminUser)) {
    const err = new Error("Only owner can deactivate owner users");
    err.code = "OWNER_ONLY";
    throw err;
  }

  if (!before.isActive) {
    return getUserByIdWithLocationForActor({
      actorUser: adminUser,
      userId: before.id,
    });
  }

  const [updated] = await db
    .update(users)
    .set({ isActive: false })
    .where(eq(users.id, targetUserId))
    .returning({ id: users.id });

  await safeLogAudit({
    locationId: before.locationId,
    userId: adminUser.id,
    action: AUDIT.USER_DEACTIVATE,
    entity: "user",
    entityId: updated.id,
    description: `Deactivated user ${before.email}`,
    meta: { isActive: { from: true, to: false } },
  });

  return getUserByIdWithLocationForActor({
    actorUser: adminUser,
    userId: updated.id,
  });
}

async function resetUserPassword({ adminUser, targetUserId, password }) {
  const before = await getRawUserForActor({
    actorUser: adminUser,
    userId: targetUserId,
  });

  if (!before) {
    const err = new Error("User not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  if (before.role === ROLES.OWNER && !isOwner(adminUser)) {
    const err = new Error("Only owner can reset owner passwords");
    err.code = "OWNER_ONLY";
    throw err;
  }

  const passwordHash = hashPassword(password);

  await db
    .update(users)
    .set({
      passwordHash,
    })
    .where(eq(users.id, targetUserId));

  await safeLogAudit({
    locationId: before.locationId,
    userId: adminUser.id,
    action: AUDIT.USER_UPDATE,
    entity: "user",
    entityId: targetUserId,
    description: `Reset password for ${before.email}`,
    meta: {
      email: before.email,
      role: before.role,
      locationId: before.locationId,
      passwordReset: true,
    },
  });

  return true;
}

module.exports = {
  createUser,
  listUsers,
  updateUser,
  resetUserPassword,
  deactivateUser,
};
