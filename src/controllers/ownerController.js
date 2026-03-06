const ownerService = require("../services/ownerService");
const {
  locationCreateSchema,
  locationUpdateSchema,
  locationStatusChangeSchema,
} = require("../validators/locations.schema");

async function ownerLocations(request, reply) {
  const status = request.query?.status
    ? String(request.query.status).trim().toUpperCase()
    : null;

  try {
    const out = await ownerService.listLocations({ status });
    return reply.send({ ok: true, locations: out });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function ownerSummary(request, reply) {
  const locationId = request.query.locationId
    ? Number(request.query.locationId)
    : null;

  try {
    const out = await ownerService.getOwnerSummary({ locationId });
    return reply.send({ ok: true, summary: out });
  } catch (e) {
    if (e.code === "INVALID_LOCATION") {
      return reply.status(400).send({ error: "Invalid location id" });
    }

    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Location not found" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function createLocation(request, reply) {
  const parsed = locationCreateSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const location = await ownerService.createLocation({
      actorUser: request.user,
      data: parsed.data,
    });

    return reply.send({ ok: true, location });
  } catch (e) {
    if (e.code === "DUPLICATE_LOCATION_CODE") {
      return reply.status(409).send({ error: "Location code already exists" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function updateLocation(request, reply) {
  const locationId = Number(request.params.id);
  if (!locationId) {
    return reply.status(400).send({ error: "Invalid location id" });
  }

  const parsed = locationUpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const location = await ownerService.updateLocation({
      actorUser: request.user,
      locationId,
      data: parsed.data,
    });

    return reply.send({ ok: true, location });
  } catch (e) {
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Location not found" });
    }

    if (e.code === "DUPLICATE_LOCATION_CODE") {
      return reply.status(409).send({ error: "Location code already exists" });
    }

    if (e.code === "INVALID_LOCATION") {
      return reply.status(400).send({ error: "Invalid location id" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function closeLocation(request, reply) {
  const locationId = Number(request.params.id);
  if (!locationId) {
    return reply.status(400).send({ error: "Invalid location id" });
  }

  const parsed = locationStatusChangeSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const location = await ownerService.closeLocation({
      actorUser: request.user,
      locationId,
      reason: parsed.data.reason,
    });

    return reply.send({ ok: true, location });
  } catch (e) {
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Location not found" });
    }

    if (e.code === "LOCATION_HAS_OPEN_CASH_SESSION") {
      return reply
        .status(409)
        .send({ error: "Cannot close branch with open cash session" });
    }

    if (e.code === "INVALID_LOCATION_STATUS") {
      return reply
        .status(409)
        .send({ error: "Invalid location status change" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function reopenLocation(request, reply) {
  const locationId = Number(request.params.id);
  if (!locationId) {
    return reply.status(400).send({ error: "Invalid location id" });
  }

  try {
    const location = await ownerService.reopenLocation({
      actorUser: request.user,
      locationId,
    });

    return reply.send({ ok: true, location });
  } catch (e) {
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Location not found" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function archiveLocation(request, reply) {
  const locationId = Number(request.params.id);
  if (!locationId) {
    return reply.status(400).send({ error: "Invalid location id" });
  }

  const parsed = locationStatusChangeSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const location = await ownerService.archiveLocation({
      actorUser: request.user,
      locationId,
      reason: parsed.data.reason,
    });

    return reply.send({ ok: true, location });
  } catch (e) {
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Location not found" });
    }

    if (e.code === "LOCATION_MUST_BE_CLOSED_FIRST") {
      return reply
        .status(409)
        .send({ error: "Close branch before archiving it" });
    }

    if (e.code === "LOCATION_HAS_OPEN_CASH_SESSION") {
      return reply
        .status(409)
        .send({ error: "Cannot archive branch with open cash session" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  ownerSummary,
  ownerLocations,
  createLocation,
  updateLocation,
  closeLocation,
  reopenLocation,
  archiveLocation,
};
