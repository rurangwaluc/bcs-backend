const crypto = require("crypto");

const { db } = require("../config/db");
const { sessions } = require("../db/schema/sessions.schema");
const { users } = require("../db/schema/users.schema");
const { locations } = require("../db/schema/locations.schema");

const { eq } = require("drizzle-orm");

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function readSignedSid(request) {
  const raw = request.cookies && request.cookies.sid;
  if (!raw) return null;

  if (typeof request.unsignCookie === "function") {
    const res = request.unsignCookie(raw);
    if (!res || res.valid !== true) return null;
    return res.value;
  }

  return raw;
}

async function sessionAuth(request) {
  const tokenRaw = readSignedSid(request);
  if (!tokenRaw) {
    request.session = null;
    request.user = null;
    return;
  }

  const tokenHash = sha256Hex(tokenRaw);
  const now = new Date();

  const sessionRows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      sessionToken: sessions.sessionToken,
      expiresAt: sessions.expiresAt,
      actingAsRole: sessions.actingAsRole,
      coverageReason: sessions.coverageReason,
      coverageNote: sessions.coverageNote,
      coverageStartedAt: sessions.coverageStartedAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(eq(sessions.sessionToken, tokenHash));

  const session = sessionRows[0];
  if (!session || session.expiresAt <= now) {
    request.session = null;
    request.user = null;
    return;
  }

  const userRows = await db
    .select({
      id: users.id,
      locationId: users.locationId,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.id, session.userId));

  const user = userRows[0];
  if (!user || user.isActive === false) {
    request.session = null;
    request.user = null;
    return;
  }

  try {
    await db
      .update(users)
      .set({ lastSeenAt: now })
      .where(eq(users.id, user.id));
  } catch (e) {
    request.log?.error?.(e);
  }

  const locRows = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
    })
    .from(locations)
    .where(eq(locations.id, user.locationId));

  const loc = locRows[0] || null;

  request.session = {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    actingAsRole: session.actingAsRole ?? null,
    coverageReason: session.coverageReason ?? null,
    coverageNote: session.coverageNote ?? null,
    coverageStartedAt: session.coverageStartedAt ?? null,
    createdAt: session.createdAt ?? null,
  };

  request.user = {
    ...user,
    lastSeenAt: now.toISOString(),
    location: loc,
    actingAsRole: session.actingAsRole ?? null,
    coverageReason: session.coverageReason ?? null,
    coverageNote: session.coverageNote ?? null,
    coverageStartedAt: session.coverageStartedAt ?? null,
  };
}

module.exports = { sessionAuth };
