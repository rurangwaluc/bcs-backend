const ownerService = require("../services/ownerService");

async function ownerLocations(request, reply) {
  const out = await ownerService.listLocations();
  return reply.send({ ok: true, locations: out });
}

async function ownerSummary(request, reply) {
  const locationId = request.query.locationId
    ? Number(request.query.locationId)
    : null;
  const out = await ownerService.getOwnerSummary({ locationId });
  return reply.send({ ok: true, summary: out });
}

module.exports = { ownerSummary, ownerLocations };
