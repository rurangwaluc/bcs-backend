const ROLES = require("../permissions/roles");
const salesReadService = require("../services/salesReadService");

async function getSale(request, reply) {
  const saleId = Number(request.params.id);
  if (!saleId) return reply.status(400).send({ error: "Invalid sale id" });

  const sale = await salesReadService.getSaleById({
    locationId: request.user.locationId,
    saleId
  });

  if (!sale) return reply.status(404).send({ error: "Sale not found" });

  // Seller can only view own sale
  if (request.user.role === ROLES.SELLER && sale.sellerId !== request.user.id) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  return reply.send({ ok: true, sale });
}

async function listSales(request, reply) {
  const filters = {
    status: request.query.status || null,
    sellerId: request.query.sellerId || null,
    q: request.query.q || null,
    dateFrom: request.query.dateFrom || null,
    dateTo: request.query.dateTo || null,
    limit: request.query.limit || 50
  };

  // Seller restricted to own
  if (request.user.role === ROLES.SELLER) {
    filters.sellerId = request.user.id;
  }

  const sales = await salesReadService.listSales({
    locationId: request.user.locationId,
    filters
  });

  return reply.send({ ok: true, sales });
}

module.exports = { getSale, listSales };
