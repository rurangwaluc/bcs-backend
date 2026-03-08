"use strict";

const service = require("../services/ownerSuppliersService");

async function getOwnerSuppliersSummary(request, reply) {
  try {
    const summary = await service.getOwnerSuppliersSummary({
      q: request.query?.q || null,
      locationId: request.query?.locationId || null,
      sourceType: request.query?.sourceType || null,
      active: request.query?.active,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerSuppliersSummary failed");
    return reply.status(500).send({
      error: "Failed to load owner suppliers summary",
      debug: e?.message || String(e),
    });
  }
}

async function listOwnerSuppliers(request, reply) {
  try {
    const suppliers = await service.listOwnerSuppliers({
      q: request.query?.q || null,
      locationId: request.query?.locationId || null,
      sourceType: request.query?.sourceType || null,
      active: request.query?.active,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
      limit: request.query?.limit || 50,
      offset: request.query?.offset || 0,
    });

    return reply.send({ ok: true, suppliers });
  } catch (e) {
    request.log.error({ err: e }, "listOwnerSuppliers failed");
    return reply.status(500).send({
      error: "Failed to load owner suppliers",
      debug: e?.message || String(e),
    });
  }
}

async function getOwnerSupplier(request, reply) {
  try {
    const supplier = await service.getOwnerSupplierById({
      id: request.params?.id,
      locationId: request.query?.locationId || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
    });

    if (!supplier) {
      return reply.status(404).send({ error: "Supplier not found" });
    }

    return reply.send({ ok: true, supplier });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerSupplier failed");
    return reply.status(500).send({
      error: "Failed to load owner supplier",
      debug: e?.message || String(e),
    });
  }
}

module.exports = {
  getOwnerSuppliersSummary,
  listOwnerSuppliers,
  getOwnerSupplier,
};
