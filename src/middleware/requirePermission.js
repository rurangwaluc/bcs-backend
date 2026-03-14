const { can } = require("../permissions/policy");

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function requirePermission(action) {
  return async function (request, reply) {
    if (!request.user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const realRole = normalizeRole(request.user.role);
    const actingAsRole = normalizeRole(request.user.actingAsRole);

    const allowedByRealRole = can(realRole, action);
    const allowedByCoverageRole =
      !!actingAsRole && actingAsRole !== realRole && can(actingAsRole, action);

    if (!allowedByRealRole && !allowedByCoverageRole) {
      return reply.status(403).send({
        error: "Forbidden",
        debug: {
          realRole,
          actingAsRole: actingAsRole || null,
          required: action,
        },
      });
    }
  };
}

function requireAnyPermission(actions = []) {
  return async function (request, reply) {
    if (!request.user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const realRole = normalizeRole(request.user.role);
    const actingAsRole = normalizeRole(request.user.actingAsRole);

    const ok = actions.some(
      (a) => can(realRole, a) || (!!actingAsRole && can(actingAsRole, a)),
    );

    if (ok) return;

    return reply.status(403).send({
      error: "Forbidden",
      debug: {
        realRole,
        actingAsRole: actingAsRole || null,
        requiredAnyOf: actions,
      },
    });
  };
}

module.exports = { requirePermission, requireAnyPermission };
