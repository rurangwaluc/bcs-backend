const ownerInventoryService = require("../services/ownerInventoryService");

async function getOwnerInventorySummary(request, reply) {
  try {
    const includeInactive = ownerInventoryService.parseBool(
      request.query?.includeInactive,
    );

    const summary = await ownerInventoryService.getOwnerInventorySummary({
      includeInactive,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listOwnerInventory(request, reply) {
  try {
    const includeInactive = ownerInventoryService.parseBool(
      request.query?.includeInactive,
    );

    const inventory = await ownerInventoryService.listOwnerInventory({
      locationId: request.query?.locationId,
      includeInactive,
      search: request.query?.search,
      stockStatus: request.query?.stockStatus,
    });

    return reply.send({ ok: true, inventory });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getOwnerProductInventory(request, reply) {
  const productId = Number(request.params.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  try {
    const includeInactive = ownerInventoryService.parseBool(
      request.query?.includeInactive ?? "true",
    );

    const product =
      await ownerInventoryService.getOwnerProductInventoryByProductId({
        productId,
        includeInactive,
      });

    return reply.send({ ok: true, product });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Product not found" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  getOwnerInventorySummary,
  listOwnerInventory,
  getOwnerProductInventory,
};
