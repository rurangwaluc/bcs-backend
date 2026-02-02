const { db } = require("../config/db");
const { users } = require("../db/schema/users.schema");
const { hashPassword } = require("../utils/password");
const { eq, and } = require("drizzle-orm");
const ROLES = require("../permissions/roles");
const { safeLogAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

function isOwner(adminUser) {
  return adminUser?.role === ROLES.OWNER;
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
    .where(
      and(
        eq(users.locationId, adminUser.locationId),
        eq(users.email, data.email),
      ),
    );

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
    })
    .returning();

  // ✅ safe audit
  await safeLogAudit({
    locationId: adminUser.locationId,
    userId: adminUser.id,
    action: AUDIT.USER_CREATED,
    entity: "user",
    entityId: created.id,
    description: `Created user ${created.email} role=${created.role}`,
  });

  return created;
}

async function listUsers({ adminUser }) {
  return db
    .select({
      id: users.id,
      locationId: users.locationId,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.locationId, adminUser.locationId));
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

  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, targetUserId),
        eq(users.locationId, adminUser.locationId),
      ),
    );

  const target = rows[0];
  if (!target) {
    const err = new Error("User not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  const updates = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.role !== undefined) updates.role = data.role;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, targetUserId))
    .returning();

  await safeLogAudit({
    locationId: adminUser.locationId,
    userId: adminUser.id,
    action: AUDIT.USER_UPDATED,
    entity: "user",
    entityId: updated.id,
    description: `Updated user ${updated.email}`,
  });

  return updated;
}

async function deactivateUser({ adminUser, targetUserId }) {
  if (adminUser.id === targetUserId) {
    const err = new Error("Admin cannot deactivate self");
    err.code = "CANNOT_DEACTIVATE_SELF";
    throw err;
  }

  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, targetUserId),
        eq(users.locationId, adminUser.locationId),
      ),
    );

  const target = rows[0];
  if (!target) {
    const err = new Error("User not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  if (target.role === ROLES.OWNER && !isOwner(adminUser)) {
    const err = new Error("Only owner can deactivate owner users");
    err.code = "OWNER_ONLY";
    throw err;
  }

  if (!target.isActive) return target;

  const [updated] = await db
    .update(users)
    .set({ isActive: false })
    .where(eq(users.id, targetUserId))
    .returning();

  await safeLogAudit({
    locationId: adminUser.locationId,
    userId: adminUser.id,
    action: AUDIT.USER_DEACTIVATED,
    entity: "user",
    entityId: updated.id,
    description: `Deactivated user ${updated.email}`,
  });

  return updated;
}

module.exports = { createUser, listUsers, updateUser, deactivateUser };
