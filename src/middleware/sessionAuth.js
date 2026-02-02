const crypto = require("crypto");
const { db } = require("../config/db");
const { sessions } = require("../db/schema/sessions.schema");
const { users } = require("../db/schema/users.schema");
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

async function sessionAuth(request, reply) {
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
    })
    .from(users)
    .where(eq(users.id, session.userId));

  const user = userRows[0];
  if (!user || user.isActive === false) {
    request.user = null;
    return;
  }

  request.user = user;
}

module.exports = { sessionAuth };
