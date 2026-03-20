const crypto = require("crypto");

const { db } = require("../config/db");
const { env } = require("../config/env");

const { users } = require("../db/schema/users.schema");
const { sessions } = require("../db/schema/sessions.schema");
const { locations } = require("../db/schema/locations.schema");

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

function sidCookieOptions(expiresAt) {
  const isProd = env.NODE_ENV === "production";
  const secure = Boolean(env.COOKIE_SECURE);
  const sameSite = isProd ? "none" : "lax";

  const opts = {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    signed: true,
    expires: expiresAt,
  };

  if (env.COOKIE_DOMAIN) opts.domain = env.COOKIE_DOMAIN;
  return opts;
}

// SAFE VERSION:
// flat select only, then shape response in JS.
// This avoids Drizzle nested-select shape failures.
async function buildUserWithLocation(userId) {
  const rows = await db
    .select({
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
      userIsActive: users.isActive,
      userLastSeenAt: users.lastSeenAt,

      locationId: locations.id,
      locationName: locations.name,
      locationCode: locations.code,
      locationEmail: locations.email,
      locationPhone: locations.phone,
      locationWebsite: locations.website,
      locationLogoUrl: locations.logoUrl,
      locationAddress: locations.address,
      locationTin: locations.tin,
      locationMomoCode: locations.momoCode,
      locationBankAccounts: locations.bankAccounts,
    })
    .from(users)
    .leftJoin(locations, eq(locations.id, users.locationId))
    .where(eq(users.id, Number(userId)));

  const u = rows[0];
  if (!u) return null;

  const bankAccounts = Array.isArray(u.locationBankAccounts)
    ? u.locationBankAccounts
    : [];

  return {
    id: String(u.userId),
    name: u.userName,
    email: u.userEmail,
    role: u.userRole,
    isActive: u.userIsActive,
    lastSeenAt: u.userLastSeenAt
      ? new Date(u.userLastSeenAt).toISOString()
      : null,
    location: {
      id: u.locationId != null ? String(u.locationId) : null,
      name: u.locationName || null,
      code: u.locationCode || null,
      email: u.locationEmail || null,
      phone: u.locationPhone || null,
      website: u.locationWebsite || null,
      logoUrl: u.locationLogoUrl || null,
      address: u.locationAddress || null,
      tin: u.locationTin || null,
      momoCode: u.locationMomoCode || null,
      bankAccounts,
    },
    business: {
      name: u.locationName || null,
      code: u.locationCode || null,
      email: u.locationEmail || null,
      phone: u.locationPhone || null,
      website: u.locationWebsite || null,
      logoUrl: u.locationLogoUrl || null,
      address: u.locationAddress || null,
      tin: u.locationTin || null,
      momoCode: u.locationMomoCode || null,
      bankAccounts,
    },
  };
}

// keep this helper for login only
async function touchLastSeen(userId, request) {
  try {
    if (!userId) return;
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, Number(userId)));
  } catch (e) {
    request?.log?.warn?.(e);
  }
}

async function login(request, reply) {
  const { email, password } = request.body || {};

  const em = String(email || "")
    .trim()
    .toLowerCase();
  const pw = String(password || "");

  if (!em || !pw) {
    return reply.status(400).send({ error: "Email and password are required" });
  }

  const rows = await db.select().from(users).where(eq(users.email, em));
  const user = rows[0];

  if (!user || user.isActive === false) {
    await safeLogAudit({
      locationId: null,
      userId: null,
      action: AUDIT.LOGIN_FAILED,
      entity: "auth",
      entityId: null,
      description: `Failed login for ${em}`,
    });

    return reply.status(401).send({ error: "Invalid credentials" });
  }

  const ok = verifyPassword(pw, user.passwordHash);
  if (!ok) {
    await safeLogAudit({
      locationId: user.locationId ?? null,
      userId: user.id ?? null,
      action: AUDIT.LOGIN_FAILED,
      entity: "auth",
      entityId: user.id ?? null,
      description: `Failed login for ${em}`,
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
    locationId: user.locationId ?? null,
    userId: user.id ?? null,
    action: AUDIT.LOGIN_SUCCESS,
    entity: "session",
    entityId: null,
    description: `User logged in (${user.email})`,
  });

  reply.setCookie("sid", sessionTokenRaw, sidCookieOptions(expiresAt));

  // keep this on login so the login response reflects activity immediately
  await touchLastSeen(user.id, request);

  const userOut = await buildUserWithLocation(user.id);

  return reply.send({
    ok: true,
    user: userOut,
  });
}

async function me(request, reply) {
  if (!request.user?.id) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // IMPORTANT:
  // do NOT touch lastSeenAt here anymore.
  // sessionAuth already updates it for authenticated requests.
  const userOut = await buildUserWithLocation(Number(request.user.id));
  if (!userOut) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  return reply.send({ ok: true, user: userOut });
}

async function logout(request, reply) {
  const raw = readSignedSid(request);

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

  reply.clearCookie("sid", {
    path: "/",
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });

  return reply.send({ ok: true });
}

module.exports = { login, me, logout };
