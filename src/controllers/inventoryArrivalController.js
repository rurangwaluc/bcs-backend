const { z } = require("zod");
const service = require("../services/inventoryArrivalService");

const createSchema = z.object({
  productId: z.number().int().positive(),
  qtyReceived: z.number().int().positive(),
  notes: z.string().optional(),
  documentUrls: z.array(z.string().url()).optional(),
});

async function createArrival(request, reply) {
  try {
    const arrival = await service.createArrival({
      locationId: request.user.locationId,
      productId: request.body.productId,
      qtyReceived: request.body.qtyReceived,
      notes: request.body.notes,
      documentUrls: request.body.documentUrls,
      userId: request.user.id,
    });

    reply.send({ ok: true, arrival });
  } catch (e) {
    request.log.error(e);
    reply.status(400).send({
      error: e.message || "Failed to create stock arrival",
    });
  }
}

async function listArrivals(request, reply) {
  const arrivals = await service.listArrivals({
    locationId: request.user.locationId,
  });

  return reply.send({ ok: true, arrivals });
}

module.exports = {
  createArrival,
  listArrivals,
};
