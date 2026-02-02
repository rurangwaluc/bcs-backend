const { z } = require("zod");
const service = require("../services/stockArrivalService");

const createSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().positive(),
  reference: z.string().optional(),
  note: z.string().optional(),
});

async function createArrival(req, reply) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  const arrival = await service.createArrival({
    ...parsed.data,
    locationId: req.user.locationId,
    userId: req.user.id,
  });

  reply.send({ ok: true, arrival });
}

async function listArrivals(req, reply) {
  const rows = await service.listArrivals({
    locationId: req.user.locationId,
  });
  reply.send({ ok: true, arrivals: rows });
}

async function approveArrival(req, reply) {
  const id = Number(req.params.id);
  const row = await service.approveArrival({
    id,
    locationId: req.user.locationId,
    managerId: req.user.id,
  });

  if (!row) {
    return reply.status(404).send({ error: "Request not found" });
  }

  reply.send({ ok: true, arrival: row });
}

module.exports = {
  createArrival,
  listArrivals,
  approveArrival,
};
