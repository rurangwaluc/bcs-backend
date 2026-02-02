const holdingsService = require("../services/holdingsService");

async function myHoldings(request, reply) {
  // Any logged-in seller can see their own holdings
  if (!request.user) return reply.status(401).send({ error: "Unauthorized" });

  const rows = await holdingsService.getMyHoldings({
    locationId: request.user.locationId,
    sellerId: request.user.id
  });

  return reply.send({ ok: true, sellerId: request.user.id, holdings: rows });
}

async function sellerHoldings(request, reply) {
  const sellerId = Number(request.params.sellerId);
  if (!sellerId) return reply.status(400).send({ error: "Invalid sellerId" });

  const rows = await holdingsService.getSellerHoldings({
    locationId: request.user.locationId,
    sellerId
  });

  return reply.send({ ok: true, sellerId, holdings: rows });
}

module.exports = { myHoldings, sellerHoldings };
