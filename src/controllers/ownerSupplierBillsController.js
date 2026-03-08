const service = require("../services/ownerSupplierBillsService");

async function listOwnerSupplierBills(request, reply) {
  try {
    const bills = await service.listOwnerSupplierBills({
      locationId: request.query?.locationId,
      supplierId: request.query?.supplierId,
      status: request.query?.status,
      q: request.query?.q,
      limit: request.query?.limit,
      offset: request.query?.offset,
    });

    return reply.send({ ok: true, bills });
  } catch (e) {
    request.log.error({ err: e }, "listOwnerSupplierBills failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function ownerSupplierBillsSummary(request, reply) {
  try {
    const summary = await service.getOwnerSupplierBillsSummary({
      locationId: request.query?.locationId,
      supplierId: request.query?.supplierId,
      status: request.query?.status,
      q: request.query?.q,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error({ err: e }, "ownerSupplierBillsSummary failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getOwnerSupplierBill(request, reply) {
  try {
    const out = await service.getOwnerSupplierBillById(request.params?.id);

    if (!out) {
      return reply.status(404).send({ error: "Supplier bill not found" });
    }

    return reply.send({
      ok: true,
      bill: out.bill,
      items: out.items,
      payments: out.payments,
    });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerSupplierBill failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  listOwnerSupplierBills,
  ownerSupplierBillsSummary,
  getOwnerSupplierBill,
};
