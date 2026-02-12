// backend/src/controllers/customersController.js
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
  if (!locationId)
    return reply.status(400).send({ error: "Missing user location" });

  const customer = await customerService.createCustomer({
    locationId,
    actorId: request.user.id,
    data: parsed.data,
  });

  return reply.send({ ok: true, customer });
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

  const effectiveLocationId = isOwner
    ? (parsed.data.locationId ?? null)
    : request.user.locationId;

  const customers = await customerService.searchCustomers({
    locationId: effectiveLocationId,
    q: parsed.data.q,
  });

  return reply.send({ ok: true, customers });
}

async function getCustomerHistory(request, reply) {
  const customerId = Number(request.params.id);
  if (!customerId)
    return reply.status(400).send({ error: "Invalid customer id" });

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

  const effectiveLocationId = isOwner
    ? (q.data.locationId ?? null)
    : request.user.locationId;

  const customers = await customerService.listCustomers({
    locationId: effectiveLocationId,
    limit: q.data.limit ?? 50,
  });

  return reply.send({ ok: true, customers });
}

module.exports = {
  createCustomer,
  listCustomers,
  searchCustomers,
  getCustomerHistory,
};
