const service = require("../services/managerDashboardService");

async function getManagerDashboard(request, reply) {
  try {
    const data = await service.getManagerDashboard({
      locationId: request.user.locationId,
    });
    return reply.send({ ok: true, dashboard: data });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Failed to load dashboard" });
  }
}

module.exports = { getManagerDashboard };
