"use strict";

const service = require("../services/ownerSuppliersWriteService");

async function createOwnerSupplier(request, reply) {
  try {
    const supplier = await service.createOwnerSupplier({
      actorUser: request.user,
      payload: request.body || {},
    });

    return reply.status(201).send({ ok: true, supplier });
  } catch (e) {
    request.log.error({ err: e }, "createOwnerSupplier failed");
    return reply.status(e.statusCode || 500).send({
      error: e.message || "Failed to create supplier",
    });
  }
}

async function updateOwnerSupplier(request, reply) {
  try {
    const supplier = await service.updateOwnerSupplier({
      id: request.params?.id,
      actorUser: request.user,
      payload: request.body || {},
    });

    return reply.send({ ok: true, supplier });
  } catch (e) {
    request.log.error({ err: e }, "updateOwnerSupplier failed");
    return reply.status(e.statusCode || 500).send({
      error: e.message || "Failed to update supplier",
    });
  }
}

async function deactivateOwnerSupplier(request, reply) {
  try {
    const supplier = await service.deactivateOwnerSupplier({
      id: request.params?.id,
      actorUser: request.user,
      reason: request.body?.reason || null,
    });

    return reply.send({ ok: true, supplier });
  } catch (e) {
    request.log.error({ err: e }, "deactivateOwnerSupplier failed");
    return reply.status(e.statusCode || 500).send({
      error: e.message || "Failed to deactivate supplier",
    });
  }
}

async function reactivateOwnerSupplier(request, reply) {
  try {
    const supplier = await service.reactivateOwnerSupplier({
      id: request.params?.id,
      actorUser: request.user,
    });

    return reply.send({ ok: true, supplier });
  } catch (e) {
    request.log.error({ err: e }, "reactivateOwnerSupplier failed");
    return reply.status(e.statusCode || 500).send({
      error: e.message || "Failed to reactivate supplier",
    });
  }
}

module.exports = {
  createOwnerSupplier,
  updateOwnerSupplier,
  deactivateOwnerSupplier,
  reactivateOwnerSupplier,
};
