"use strict";

const {
  supplierBillCreateSchema,
  supplierBillUpdateSchema,
  supplierBillPaymentCreateSchema,
} = require("../validators/supplierBills.schema");
const service = require("../services/ownerSupplierBillsWriteService");

async function createOwnerSupplierBill(request, reply) {
  const parsed = supplierBillCreateSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.issues?.[0]?.message || "Invalid payload",
    });
  }

  try {
    const out = await service.createOwnerSupplierBill({
      ownerUserId: request.user.id,
      ownerLocationId: request.user.locationId,
      payload: parsed.data,
    });

    return reply.status(201).send({
      ok: true,
      bill: out?.bill || null,
      items: out?.items || [],
      payments: out?.payments || [],
    });
  } catch (e) {
    request.log.error({ err: e }, "createOwnerSupplierBill failed");

    if (e.code === "BAD_SUPPLIER_ID") {
      return reply.status(400).send({ error: "Invalid supplier id" });
    }
    if (e.code === "BAD_LOCATION_ID") {
      return reply.status(400).send({ error: "Invalid location id" });
    }
    if (e.code === "SUPPLIER_NOT_FOUND") {
      return reply.status(404).send({ error: "Supplier not found" });
    }
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Branch not found" });
    }
    if (e.code === "BAD_TOTAL") {
      return reply.status(409).send({ error: e.message });
    }

    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function updateOwnerSupplierBill(request, reply) {
  const billId = Number(request.params?.id);
  if (!Number.isInteger(billId) || billId <= 0) {
    return reply.status(400).send({ error: "Invalid bill id" });
  }

  const parsed = supplierBillUpdateSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.issues?.[0]?.message || "Invalid payload",
    });
  }

  try {
    const out = await service.updateOwnerSupplierBill({
      ownerUserId: request.user.id,
      billId,
      payload: parsed.data,
    });

    return reply.send({
      ok: true,
      bill: out?.bill || null,
      items: out?.items || [],
      payments: out?.payments || [],
    });
  } catch (e) {
    request.log.error({ err: e }, "updateOwnerSupplierBill failed");

    if (e.code === "BAD_BILL_ID") {
      return reply.status(400).send({ error: "Invalid bill id" });
    }
    if (e.code === "BAD_LOCATION_ID") {
      return reply.status(400).send({ error: "Invalid location id" });
    }
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Supplier bill not found" });
    }
    if (e.code === "SUPPLIER_NOT_FOUND") {
      return reply.status(404).send({ error: "Supplier not found" });
    }
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Branch not found" });
    }
    if (
      e.code === "VOID_LOCKED" ||
      e.code === "PAID_EXCEEDS_TOTAL" ||
      e.code === "BAD_TOTAL" ||
      e.code === "BAD_ITEMS" ||
      e.code === "USE_VOID_ACTION"
    ) {
      return reply.status(409).send({ error: e.message });
    }

    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function addOwnerSupplierBillPayment(request, reply) {
  const billId = Number(request.params?.id);
  if (!Number.isInteger(billId) || billId <= 0) {
    return reply.status(400).send({ error: "Invalid bill id" });
  }

  const parsed = supplierBillPaymentCreateSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.issues?.[0]?.message || "Invalid payload",
    });
  }

  try {
    const out = await service.addOwnerSupplierBillPayment({
      ownerUserId: request.user.id,
      billId,
      payload: parsed.data,
    });

    return reply.send({
      ok: true,
      bill: out?.bill || null,
      items: out?.items || [],
      payments: out?.payments || [],
    });
  } catch (e) {
    request.log.error({ err: e }, "addOwnerSupplierBillPayment failed");

    if (e.code === "BAD_BILL_ID") {
      return reply.status(400).send({ error: "Invalid bill id" });
    }
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Supplier bill not found" });
    }
    if (
      e.code === "VOID_LOCKED" ||
      e.code === "ALREADY_PAID" ||
      e.code === "EXCEEDS_BALANCE" ||
      e.code === "BAD_AMOUNT"
    ) {
      return reply.status(409).send({ error: e.message });
    }

    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function voidOwnerSupplierBill(request, reply) {
  const billId = Number(request.params?.id);
  if (!Number.isInteger(billId) || billId <= 0) {
    return reply.status(400).send({ error: "Invalid bill id" });
  }

  try {
    const out = await service.voidOwnerSupplierBill({
      ownerUserId: request.user.id,
      billId,
      reason: request.body?.reason,
    });

    return reply.send({
      ok: true,
      bill: out?.bill || null,
      items: out?.items || [],
      payments: out?.payments || [],
    });
  } catch (e) {
    request.log.error({ err: e }, "voidOwnerSupplierBill failed");

    if (e.code === "BAD_BILL_ID") {
      return reply.status(400).send({ error: "Invalid bill id" });
    }
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Supplier bill not found" });
    }
    if (e.code === "HAS_PAYMENTS") {
      return reply.status(409).send({
        error: "Cannot void a bill that already has payments",
      });
    }

    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createOwnerSupplierBill,
  updateOwnerSupplierBill,
  addOwnerSupplierBillPayment,
  voidOwnerSupplierBill,
};
