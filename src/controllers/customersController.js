"use strict";

const {
  createCustomerSchema,
  searchCustomerSchema,
  listCustomersQuerySchema,
  customerHistoryQuerySchema,
} = require("../validators/customers.schema");

const customerService = require("../services/customerService");
const { customerHistory } = require("../services/customerHistoryService");

function isOwnerRole(request) {
  return String(request.user?.role || "").toLowerCase() === "owner";
}

function resolveScopedLocationId(request, requestedLocationId = null) {
  const isOwner = isOwnerRole(request);
  return isOwner ? (requestedLocationId ?? null) : request.user?.locationId;
}

function ensureLocationScope(request, reply, requestedLocationId = null) {
  const effectiveLocationId = resolveScopedLocationId(
    request,
    requestedLocationId,
  );

  if (!isOwnerRole(request) && !effectiveLocationId) {
    reply.status(400).send({ error: "Missing user location" });
    return { ok: false, effectiveLocationId: null };
  }

  return { ok: true, effectiveLocationId };
}

function normalizeHistoryResponse(history) {
  const rows = Array.isArray(history?.rows) ? history.rows : [];
  const totals = history?.totals || {
    salesCount: 0,
    salesTotalAmount: 0,
    paymentsTotalAmount: 0,
    creditsTotalAmount: 0,
    refundsTotalAmount: 0,
  };

  return { rows, totals };
}

async function createCustomer(request, reply) {
  const parsed = createCustomerSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  const locationId = request.user?.locationId;
  if (!locationId) {
    return reply.status(400).send({ error: "Missing user location" });
  }

  try {
    const customer = await customerService.createCustomer({
      locationId,
      actorId: request.user.id,
      data: parsed.data,
    });

    return reply.send({
      ok: true,
      customer,
      message: "Customer created successfully",
    });
  } catch (e) {
    if (e.code === "VALIDATION") {
      return reply.status(400).send({ error: e.message || "Invalid payload" });
    }

    request.log.error(
      {
        err: e,
        userId: request.user?.id,
        locationId,
        body: parsed.data,
      },
      "createCustomer failed",
    );

    return reply.status(500).send({
      error: e?.message || "Failed to create customer",
    });
  }
}

async function searchCustomers(request, reply) {
  const parsed = searchCustomerSchema.safeParse(request.query || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid query",
      details: parsed.error.flatten(),
    });
  }

  const scope = ensureLocationScope(
    request,
    reply,
    parsed.data.locationId ?? null,
  );
  if (!scope.ok) return;

  try {
    const customers = await customerService.searchCustomers({
      locationId: scope.effectiveLocationId,
      q: parsed.data.q,
    });

    return reply.send({
      ok: true,
      customers: Array.isArray(customers) ? customers : [],
    });
  } catch (e) {
    request.log.error(
      {
        err: e,
        userId: request.user?.id,
        role: request.user?.role,
        query: parsed.data,
        effectiveLocationId: scope.effectiveLocationId,
      },
      "searchCustomers failed",
    );

    return reply.status(500).send({
      error: e?.message || "Failed to search customers",
    });
  }
}

async function getCustomerHistory(request, reply) {
  const customerId = Number(request.params?.id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return reply.status(400).send({ error: "Invalid customer id" });
  }

  const parsed = customerHistoryQuerySchema.safeParse(request.query || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid query",
      details: parsed.error.flatten(),
    });
  }

  const scope = ensureLocationScope(
    request,
    reply,
    parsed.data.locationId ?? null,
  );
  if (!scope.ok) return;

  try {
    const history = await customerHistory({
      locationId: scope.effectiveLocationId,
      customerId,
      limit: parsed.data.limit ?? 50,
    });

    const normalized = normalizeHistoryResponse(history);

    return reply.send({
      ok: true,
      customerId,
      sales: normalized.rows,
      totals: normalized.totals,
    });
  } catch (e) {
    request.log.error(
      {
        err: e,
        userId: request.user?.id,
        role: request.user?.role,
        customerId,
        query: parsed.data,
        effectiveLocationId: scope.effectiveLocationId,
      },
      "getCustomerHistory failed",
    );

    return reply.status(500).send({
      error: e?.message || "Failed to load customer history",
    });
  }
}

async function listCustomers(request, reply) {
  const parsed = listCustomersQuerySchema.safeParse(request.query || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid query",
      details: parsed.error.flatten(),
    });
  }

  const scope = ensureLocationScope(
    request,
    reply,
    parsed.data.locationId ?? null,
  );
  if (!scope.ok) return;

  try {
    const result = await customerService.listCustomers({
      locationId: scope.effectiveLocationId,
      limit: parsed.data.limit ?? 50,
      cursor: parsed.data.cursor ?? null,
    });

    return reply.send({
      ok: true,
      customers: Array.isArray(result?.customers) ? result.customers : [],
      nextCursor: result?.nextCursor ?? null,
    });
  } catch (e) {
    request.log.error(
      {
        err: e,
        userId: request.user?.id,
        role: request.user?.role,
        query: parsed.data,
        effectiveLocationId: scope.effectiveLocationId,
      },
      "listCustomers failed",
    );

    return reply.status(500).send({
      error: e?.message || "Failed to load customers",
    });
  }
}

module.exports = {
  createCustomer,
  listCustomers,
  searchCustomers,
  getCustomerHistory,
};
