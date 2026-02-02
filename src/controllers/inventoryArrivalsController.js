const {
  createInventoryArrivalSchema,
  listInventoryArrivalsQuerySchema,
} = require("../validators/inventoryArrivals.schema");

const inventoryArrivalsService = require("../services/inventoryArrivalsService");

/**
 * POST /inventory/arrivals
 */
async function createInventoryArrival(request, reply) {
  const parsed = createInventoryArrivalSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const arrival = await inventoryArrivalsService.createArrival({
      locationId: request.user.locationId,
      userId: request.user.id,
      productId: parsed.data.productId,
      qtyReceived: parsed.data.qtyReceived,
      notes: parsed.data.notes,
      documentUrls: parsed.data.documentUrls,
    });

    return reply.send({ ok: true, arrival });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "Failed to create inventory arrival",
      message: e?.message,
    });
  }
}

/**
 * GET /inventory/arrivals
 */
async function listInventoryArrivals(request, reply) {
  const parsedQuery = listInventoryArrivalsQuerySchema.safeParse(request.query);

  if (!parsedQuery.success) {
    return reply.status(400).send({
      error: "Invalid query parameters",
      details: parsedQuery.error.flatten(),
    });
  }

  const { limit = 50, offset = 0, productId } = parsedQuery.data;

  try {
    const arrivals = await inventoryArrivalsService.listArrivals({
      locationId: request.user.locationId,
      limit,
      offset,
      productId,
    });

    return reply.send({ ok: true, arrivals });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "Failed to load inventory arrivals",
      message: e?.message,
    });
  }
}

/**
 * Aliases for route compatibility
 */
const createArrival = createInventoryArrival;
const listArrivals = listInventoryArrivals;

module.exports = {
  createInventoryArrival,
  listInventoryArrivals,
  createArrival,
  listArrivals,
};
