"use strict";

const {
  createCustomerSchema,
  searchCustomerSchema,
  listCustomersQuerySchema,
  customerHistoryQuerySchema,
} = require("../validators/customers.schema");

const customerService = require("../services/customerService");
const { customerHistory } = require("../services/customerHistoryService");

async function createCustomer(request, reply) {
  const parsed = createCustomerSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
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

    return reply.send({ ok: true, customer });
  } catch (e) {
    if (e.code === "VALIDATION") {
      return reply.status(400).send({ error: e.message });
    }

    request.log.error({ err: e }, "createCustomer failed");
    return reply.status(500).send({ error: "Failed to create customer" });
  }
}

async function searchCustomers(request, reply) {
  const parsed = searchCustomerSchema.safeParse(request.query);
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid query", details: parsed.error.flatten() });
  }

  const role = String(request.user?.role || "").toLowerCase();
  const isOwner = role === "owner";

  if (!isOwner && !request.user?.locationId) {
    return reply.status(400).send({ error: "Missing user location" });
  }

  try {
    const effectiveLocationId = isOwner
      ? (parsed.data.locationId ?? null)
      : request.user.locationId;

    console.log("[CUSTOMERS][SEARCH]", {
      role,
      isOwner,
      requestUser: request.user,
      query: parsed.data,
      effectiveLocationId,
    });

    const customers = await customerService.searchCustomers({
      locationId: effectiveLocationId,
      q: parsed.data.q,
    });

    return reply.send({ ok: true, customers });
  } catch (e) {
    request.log.error({ err: e }, "searchCustomers failed");
    return reply.status(500).send({ error: "Failed to search customers" });
  }
}

async function getCustomerHistory(request, reply) {
  const customerId = Number(request.params.id);
  if (!customerId) {
    return reply.status(400).send({ error: "Invalid customer id" });
  }

  const q = customerHistoryQuerySchema.safeParse(request.query);
  if (!q.success) {
    return reply
      .status(400)
      .send({ error: "Invalid query", details: q.error.flatten() });
  }

  const role = String(request.user?.role || "").toLowerCase();
  const isOwner = role === "owner";

  if (!isOwner && !request.user?.locationId) {
    return reply.status(400).send({ error: "Missing user location" });
  }

  try {
    const effectiveLocationId = isOwner
      ? (q.data.locationId ?? null)
      : request.user.locationId;

    const history = await customerHistory({
      locationId: effectiveLocationId,
      customerId,
      limit: q.data.limit ?? 50,
    });

    return reply.send({
      ok: true,
      customerId,
      sales: history.rows,
      totals: history.totals,
    });
  } catch (e) {
    request.log.error({ err: e }, "getCustomerHistory failed");
    return reply.status(500).send({ error: "Failed to load customer history" });
  }
}

async function listCustomers(request, reply) {
  const q = listCustomersQuerySchema.safeParse(request.query || {});
  if (!q.success) {
    return reply
      .status(400)
      .send({ error: "Invalid query", details: q.error.flatten() });
  }

  const role = String(request.user?.role || "").toLowerCase();
  const isOwner = role === "owner";

  if (!isOwner && !request.user?.locationId) {
    return reply.status(400).send({ error: "Missing user location" });
  }

  try {
    const effectiveLocationId = isOwner
      ? (q.data.locationId ?? null)
      : request.user.locationId;

    console.log("[CUSTOMERS][LIST]", {
      role,
      isOwner,
      requestUser: {
        id: request.user?.id,
        role: request.user?.role,
        locationId: request.user?.locationId,
        email: request.user?.email,
      },
      query: q.data,
      effectiveLocationId,
    });

    const result = await customerService.listCustomers({
      locationId: effectiveLocationId,
      limit: q.data.limit ?? 50,
      cursor: q.data.cursor ?? null,
    });

    console.log("[CUSTOMERS][LIST][RESULT]", {
      count: Array.isArray(result?.customers) ? result.customers.length : -1,
      nextCursor: result?.nextCursor ?? null,
      firstRow: result?.customers?.[0] || null,
    });

    return reply.send({
      ok: true,
      customers: result.customers,
      nextCursor: result.nextCursor,
    });
  } catch (e) {
    request.log.error({ err: e }, "listCustomers failed");
    return reply.status(500).send({ error: "Failed to load customers" });
  }
}

module.exports = {
  createCustomer,
  listCustomers,
  searchCustomers,
  getCustomerHistory,
};
