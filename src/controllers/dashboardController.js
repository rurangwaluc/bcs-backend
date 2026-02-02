const dashboardService = require("../services/dashboardService");

async function ownerSummary(request, reply) {
  const data = await dashboardService.ownerSummary({
    locationId: request.user.locationId
  });

  return reply.send({ ok: true, dashboard: data });
}

module.exports = { ownerSummary };
