const { getAdminDashboard } = require("../services/adminDashboardService");

async function getAdminDashboardController(req, reply) {
  const locationId = req.user?.locationId;
  if (!locationId) return reply.code(400).send({ error: "Missing locationId" });

  const dashboard = await getAdminDashboard({ locationId });
  return reply.send({ dashboard });
}

module.exports = { getAdminDashboard: getAdminDashboardController };
