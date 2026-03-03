// backend/src/controllers/bootstrapController.js
const { db } = require("../config/db");
const { env } = require("../config/env");
const { users } = require("../db/schema/users.schema");
const { locations } = require("../db/schema/locations.schema");
const { sessions } = require("../db/schema/sessions.schema");
const { hashPassword } = require("../utils/password");

function requireBootstrapSecret(request, reply) {
  if (!env.BOOTSTRAP_SECRET) {
    reply.code(503).send({ error: "Bootstrap is disabled (missing BOOTSTRAP_SECRET)" });
    return false;
  }

  const secret =
    request.headers["x-bootstrap-secret"] ||
    request.headers["X-Bootstrap-Secret"];

  if (String(secret || "") !== String(env.BOOTSTRAP_SECRET)) {
    reply.code(401).send({ error: "Invalid bootstrap secret" });
    return false;
  }
  return true;
}

async function bootstrap(request, reply) {
  if (!requireBootstrapSecret(request, reply)) return;

  const body = request.body || {};

  const locationName = String(body.locationName || "Main Store").trim();
  const locationCode = String(body.locationCode || "LOC-1").trim().toUpperCase();

  const ownerName = String(body.ownerName || "Bcs Owner").trim();
  const ownerEmail = String(body.ownerEmail || "bcs@company.com").trim().toLowerCase();
  const ownerPassword = String(body.ownerPassword || "ChangeMe123!").trim();

  if (!locationName || !locationCode) {
    return reply.code(400).send({ error: "locationName and locationCode are required" });
  }
  if (!ownerEmail || !ownerPassword) {
    return reply.code(400).send({ error: "ownerEmail and ownerPassword are required" });
  }

  // Only allow when DB is empty (no users)
  const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
  if (existingUsers.length > 0) {
    return reply.code(409).send({ error: "Bootstrap already done (users exist)" });
  }

  // Hard safety: clear sessions too (not required, but safe)
  await db.delete(sessions);

  // Create location then owner
  const insertedLoc = await db
    .insert(locations)
    .values({ name: locationName, code: locationCode })
    .returning({ id: locations.id, name: locations.name, code: locations.code });

  const loc = insertedLoc[0];

  const passwordHash = hashPassword(ownerPassword);

  const insertedUser = await db
    .insert(users)
    .values({
      locationId: loc.id,
      name: ownerName,
      email: ownerEmail,
      passwordHash,
      role: "owner",
      isActive: true,
    })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

  const u = insertedUser[0];

  return reply.send({
    ok: true,
    created: {
      location: { id: String(loc.id), name: loc.name, code: loc.code },
      owner: { id: String(u.id), name: u.name, email: u.email, role: u.role },
    },
    next: {
      loginUrl: "/auth/login",
      loginBody: { email: ownerEmail, password: ownerPassword },
    },
  });
}

module.exports = { bootstrap };