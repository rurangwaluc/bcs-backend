// backend/src/controllers/inventoryAdjustRequestsController.js
const service = require("../services/inventoryAdjustRequestsService");

const {
  createInventoryAdjustRequestSchema,
  decideInventoryAdjustRequestSchema,
  listInventoryAdjustRequestsQuerySchema,
} = require("../validators/inventoryAdjustRequests.schema");

async function createAdjustRequest(request, reply) {
  const parsed = createInventoryAdjustRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const reqRow = await service.createRequest({
      locationId: request.user.locationId,
      productId: parsed.data.productId,
      qtyChange: parsed.data.qtyChange,
      reason: parsed.data.reason,
      requestedByUserId: request.user.id,
    });

    return reply.send({ ok: true, request: reqRow });
  } catch (e) {
    request.log.error(e);
    return reply
      .status(500)
      .send({ error: e?.message || "Internal Server Error" });
  }
}

async function listAdjustRequests(request, reply) {
  const parsed = listInventoryAdjustRequestsQuerySchema.safeParse(
    request.query || {},
  );
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid query",
      details: parsed.error.flatten(),
    });
  }

  try {
    const rows = await service.listRequests({
      locationId: request.user.locationId,
      role: request.user.role,
      userId: request.user.id,
      status: parsed.data.status,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return reply.send({ ok: true, requests: rows });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listMineAdjustRequests(request, reply) {
  const parsed = listInventoryAdjustRequestsQuerySchema.safeParse(
    request.query || {},
  );
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid query",
      details: parsed.error.flatten(),
    });
  }

  try {
    const rows = await service.listRequests({
      locationId: request.user.locationId,
      role: request.user.role, // ✅ important
      userId: request.user.id, // ✅ important
      status: parsed.data.status,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      // store_keeper filtering is enforced in service when role === "store_keeper"
    });

    return reply.send({ ok: true, requests: rows });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function approveAdjustRequest(request, reply) {
  const id = Number(request.params.id);
  const parsed = decideInventoryAdjustRequestSchema.safeParse({ id });

  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid id" });
  }

  try {
    const updated = await service.approveRequest({
      id,
      locationId: request.user.locationId,
      decidedByUserId: request.user.id,
    });

    return reply.send({ ok: true, request: updated });
  } catch (e) {
    if (e.code === "NOT_FOUND")
      return reply.status(404).send({ error: "Request not found" });
    if (e.code === "ALREADY_DECIDED")
      return reply.status(409).send({ error: "Request already decided" });

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function declineAdjustRequest(request, reply) {
  const id = Number(request.params.id);
  const parsed = decideInventoryAdjustRequestSchema.safeParse({ id });

  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid id" });
  }

  try {
    const updated = await service.declineRequest({
      id,
      locationId: request.user.locationId,
      decidedByUserId: request.user.id,
    });

    return reply.send({ ok: true, request: updated });
  } catch (e) {
    if (e.code === "NOT_FOUND")
      return reply.status(404).send({ error: "Request not found" });
    if (e.code === "ALREADY_DECIDED")
      return reply.status(409).send({ error: "Request already decided" });

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createAdjustRequest,
  listAdjustRequests,
  listMineAdjustRequests,
  approveAdjustRequest,
  declineAdjustRequest,
};
