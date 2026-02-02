const service = require("../services/inventoryAdjustmentRequestService");

async function createRequest(request, reply) {
  const { productId, qtyChange, reason } = request.body;

  if (!productId || !qtyChange || !reason) {
    return reply.status(400).send({ error: "Invalid payload" });
  }

  const result = await service.createRequest({
    locationId: request.user.locationId,
    userId: request.user.id,
    productId,
    qtyChange,
    reason,
  });

  return reply.send({ ok: true, request: result });
}

async function listRequests(request, reply) {
  const rows = await service.listRequests({
    locationId: request.user.locationId,
  });
  return reply.send({ ok: true, requests: rows });
}

async function decideRequest(request, reply) {
  const id = Number(request.params.id);
  const { decision } = request.body;

  if (!["APPROVE", "REJECT"].includes(decision)) {
    return reply.status(400).send({ error: "Invalid decision" });
  }

  const result = await service.decideRequest({
    locationId: request.user.locationId,
    requestId: id,
    userId: request.user.id,
    decision,
  });

  return reply.send({ ok: true, request: result });
}

module.exports = {
  createRequest,
  listRequests,
  decideRequest,
};
