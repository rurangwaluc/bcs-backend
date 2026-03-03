// backend/src/middleware/sessionAuth.js
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
    request.user = null;
    return;
  }

  const tokenHash = sha256Hex(tokenRaw);
  const now = new Date();

  const sessionRows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.sessionToken, tokenHash));

  const session = sessionRows[0];
  if (!session || session.expiresAt <= now) {
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

      // ✅ add it to the session user payload
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.id, session.userId));

  const user = userRows[0];
  if (!user || user.isActive === false) {
    request.user = null;
    return;
  }

  // ✅ update lastSeenAt (simple + reliable)
  // We do it AFTER we confirm session + user.
  // If you want less DB writes later, we can throttle it.
  try {
    await db
      .update(users)
      .set({ lastSeenAt: now })
      .where(eq(users.id, user.id));
  } catch (e) {
    // Do not block the request if this fails
    request.log?.error?.(e);
  }

  // Load location details (name + code)
  const locRows = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
    })
    .from(locations)
    .where(eq(locations.id, user.locationId));

  const loc = locRows[0] || null;

  request.user = {
    ...user,
    lastSeenAt: now.toISOString(), // ✅ set to "now" for this request
    location: loc,
  };
}

module.exports = { sessionAuth };