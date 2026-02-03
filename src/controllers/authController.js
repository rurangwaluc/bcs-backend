const crypto = require("crypto");
const { db } = require("../config/db");
const { users } = require("../db/schema/users.schema");
const { sessions } = require("../db/schema/sessions.schema");
const { verifyPassword } = require("../utils/password");
const { eq } = require("drizzle-orm");
const { safeLogAudit } = require("../services/auditService");
const AUDIT = require("../audit/actions");

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

/**
 * 🔥 CRITICAL FIX
 * Do NOT unsign cookies. Signed cookies break when passing
 * through Next.js proxy (/api) and Vercel.
 */
function readSid(request) {
  return request.cookies?.sid || null;
}

async function login(request, reply) {
  const { email, password } = request.body;

  const rows = await db.select().from(users).where(eq(users.email, email));
  const user = rows[0];

  if (!user || user.isActive === false) {
    await safeLogAudit({
      locationId: null,
      userId: null,
      action: AUDIT.LOGIN_FAILED,
      entity: "auth",
      entityId: null,
      description: `Failed login for ${email}`,
    });
    return reply.status(401).send({ error: "Invalid credentials" });
  }

  const ok = verifyPassword(password, user.passwordHash);
  if (!ok) {
    await safeLogAudit({
      locationId: user.locationId,
      userId: user.id,
      action: AUDIT.LOGIN_FAILED,
      entity: "auth",
      entityId: user.id,
      description: `Failed login for ${email}`,
    });
    return reply.status(401).send({ error: "Invalid credentials" });
  }

  const sessionTokenRaw = makeToken();
  const sessionTokenHash = sha256Hex(sessionTokenRaw);

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await db.insert(sessions).values({
    userId: user.id,
    sessionToken: sessionTokenHash,
    expiresAt,
  });

  await safeLogAudit({
    locationId: user.locationId,
    userId: user.id,
    action: AUDIT.LOGIN_SUCCESS,
    entity: "session",
    entityId: null,
    description: `User logged in (${user.email})`,
  });

  /**
   * 🔥 CRITICAL FIX
   * Plain cookie — no signing
   */
  reply.setCookie("sid", sessionTokenRaw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    expires: expiresAt,
  });

  return reply.send({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      locationId: user.locationId,
    },
  });
}

async function me(request, reply) {
  if (!request.user) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  return reply.send({ user: request.user });
}

async function logout(request, reply) {
  const raw = readSid(request);

  if (raw) {
    const hash = sha256Hex(raw);
    await db.delete(sessions).where(eq(sessions.sessionToken, hash));
  }

  await safeLogAudit({
    locationId: request.user?.locationId ?? null,
    userId: request.user?.id ?? null,
    action: AUDIT.LOGOUT,
    entity: "session",
    entityId: null,
    description: `User logged out`,
  });

  reply.clearCookie("sid", { path: "/" });
  return reply.send({ ok: true });
}

module.exports = { login, me, logout };
