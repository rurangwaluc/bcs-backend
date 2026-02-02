const { createStockRequestSchema, approveStockRequestSchema } = require("../validators/requests.schema");
const requestService = require("../services/requestService");



async function listRequests(request, reply) {
  try {
    const { status, page, limit } = request.query;

    const isSeller = request.user.role === "SELLER";

    const result = await requestService.listRequests({
      locationId: request.user.locationId,
      sellerId: isSeller ? request.user.id : undefined,
      status,
      page: Number(page) || 1,
      limit: Number(limit) || 20
    });

    return reply.send({ ok: true, ...result });
  } catch (e) {
      console.error("LIST REQUESTS ERROR ↓↓↓");

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}



async function createStockRequest(request, reply) {
  const parsed = createStockRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });

  const req = await requestService.createRequest({
    locationId: request.user.locationId,
    sellerId: request.user.id,
    note: parsed.data.note,
    items: parsed.data.items
  });

  return reply.send({ ok: true, request: req });
}



async function approveStockRequest(request, reply) {
  const parsed = approveStockRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });

  try {
    const result = await requestService.approveOrReject({
      locationId: request.user.locationId,
      requestId: Number(request.params.id),
      managerId: request.user.id,
      decision: parsed.data.decision,
      note: parsed.data.note,
      items: parsed.data.items
    });
    return reply.send({ ok: true, result });
  } catch (e) {
    if (e.code === "BAD_STATUS") return reply.status(409).send({ error: "Invalid status" });
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function releaseToSeller(request, reply) {
  try {
    const result = await requestService.releaseToSeller({
      locationId: request.user.locationId,
      requestId: Number(request.params.id),
      storeKeeperId: request.user.id
    });
    return reply.send({ ok: true, result });
  } catch (e) {
    if (e.code === "BAD_STATUS") return reply.status(409).send({ error: "Invalid status" });
    if (e.code === "INSUFFICIENT_STOCK") return reply.status(409).send({ error: "Insufficient stock" });
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { createStockRequest, approveStockRequest, releaseToSeller, listRequests };
