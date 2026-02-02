// backend/middleware/requirePermission.js
const { can } = require("../permissions/policy");

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase();
}

function requirePermission(action) {
  return async function (request, reply) {
    // If not authenticated
    if (!request.user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const role = normalizeRole(request.user.role);

    if (!can(role, action)) {
      return reply.status(403).send({
        error: "Forbidden",
        debug: {
          role,
          required: action,
        },
      });
    }
  };
}

// Optional helper (useful later)
function requireAnyPermission(actions = []) {
  return async function (request, reply) {
    if (!request.user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const role = normalizeRole(request.user.role);

    for (const a of actions) {
      if (can(role, a)) return;
    }

    return reply.status(403).send({
      error: "Forbidden",
      debug: {
        role,
        requiredAnyOf: actions,
      },
    });
  };
}

module.exports = { requirePermission, requireAnyPermission };
