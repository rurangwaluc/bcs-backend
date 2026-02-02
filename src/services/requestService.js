const { db } = require("../config/db");
const { stockRequests } = require("../db/schema/stock_requests.schema");
const { products } = require("../db/schema/products.schema");
const {
  stockRequestItems,
} = require("../db/schema/stock_request_items.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { sellerHoldings } = require("../db/schema/seller_holdings.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and, desc, inArray, sql } = require("drizzle-orm");

async function listRequests({
  locationId,
  sellerId,
  status,
  page = 1,
  limit = 20,
}) {
  const offset = (page - 1) * limit;

  const conditions = [eq(stockRequests.locationId, locationId)];
  if (sellerId) conditions.push(eq(stockRequests.sellerId, sellerId));
  if (status) conditions.push(eq(stockRequests.status, status));
  const whereClause = and(...conditions);

  const requests = await db
    .select()
    .from(stockRequests)
    .where(whereClause)
    .orderBy(desc(stockRequests.createdAt))
    .limit(limit)
    .offset(offset);

  const requestIds = requests.map((r) => r.id);
  let items = [];

  if (requestIds.length > 0) {
    items = await db
      .select({
        id: stockRequestItems.id,
        requestId: stockRequestItems.requestId,
        productId: stockRequestItems.productId,
        qtyRequested: stockRequestItems.qtyRequested,
        qtyApproved: stockRequestItems.qtyApproved,
        productName: products.name,
        sku: products.sku,
      })
      .from(stockRequestItems)
      .leftJoin(products, eq(products.id, stockRequestItems.productId))
      .where(inArray(stockRequestItems.requestId, requestIds));
  }

  const itemsByRequest = new Map();
  for (const item of items) {
    if (!itemsByRequest.has(item.requestId))
      itemsByRequest.set(item.requestId, []);
    itemsByRequest.get(item.requestId).push(item);
  }

  const data = requests.map((r) => ({
    ...r,
    items: itemsByRequest.get(r.id) || [],
  }));

  const [{ count }] = await db
    .select({ count: sql`count(*)` })
    .from(stockRequests)
    .where(whereClause);

  return {
    data,
    meta: {
      page,
      limit,
      total: Number(count),
      pages: Math.ceil(Number(count) / limit),
    },
  };
}

async function createRequest({ locationId, sellerId, note, items }) {
  return db.transaction(async (tx) => {
    const [req] = await tx
      .insert(stockRequests)
      .values({ locationId, sellerId, status: "PENDING", note: note || null })
      .returning();

    const rows = items.map((i) => ({
      requestId: req.id,
      productId: i.productId,
      qtyRequested: i.qtyRequested,
      qtyApproved: 0,
    }));

    await tx.insert(stockRequestItems).values(rows);

    // ✅ FIX: include locationId (DB requires NOT NULL)
    await tx.insert(auditLogs).values({
      locationId,
      userId: sellerId,
      action: "STOCK_REQUEST_CREATE",
      entity: "stock_request",
      entityId: req.id,
      description: `Seller created stock request #${req.id}`,
    });

    return req;
  });
}

async function approveOrReject({
  locationId,
  requestId,
  managerId,
  decision,
  note,
  items,
}) {
  return db.transaction(async (tx) => {
    const reqRows = await tx
      .select()
      .from(stockRequests)
      .where(
        and(
          eq(stockRequests.id, requestId),
          eq(stockRequests.locationId, locationId),
        ),
      );

    const req = reqRows[0];
    if (!req) throw new Error("Request not found");

    if (req.status !== "PENDING") {
      const err = new Error("Invalid status");
      err.code = "BAD_STATUS";
      throw err;
    }

    if (decision === "REJECT") {
      await tx
        .update(stockRequests)
        .set({
          status: "REJECTED",
          note: note || req.note,
          decidedAt: new Date(),
          decidedBy: managerId,
        })
        .where(eq(stockRequests.id, requestId));

      // ✅ FIX: include locationId
      await tx.insert(auditLogs).values({
        locationId,
        userId: managerId,
        action: "STOCK_REQUEST_REJECT",
        entity: "stock_request",
        entityId: requestId,
        description: `Stock request #${requestId} rejected`,
      });

      return { id: requestId, status: "REJECTED" };
    }

    // APPROVE
    const itemRows = await tx
      .select()
      .from(stockRequestItems)
      .where(eq(stockRequestItems.requestId, requestId));

    const approvedMap = new Map();
    if (items && items.length) {
      for (const it of items) approvedMap.set(it.productId, it.qtyApproved);
    }

    for (const line of itemRows) {
      const qtyApproved = approvedMap.has(line.productId)
        ? approvedMap.get(line.productId)
        : line.qtyRequested;

      await tx
        .update(stockRequestItems)
        .set({ qtyApproved })
        .where(eq(stockRequestItems.id, line.id));
    }

    await tx
      .update(stockRequests)
      .set({
        status: "APPROVED",
        note: note || req.note,
        decidedAt: new Date(),
        decidedBy: managerId,
      })
      .where(eq(stockRequests.id, requestId));

    // ✅ FIX: include locationId
    await tx.insert(auditLogs).values({
      locationId,
      userId: managerId,
      action: "STOCK_REQUEST_APPROVE",
      entity: "stock_request",
      entityId: requestId,
      description: `Stock request #${requestId} approved`,
    });

    return { id: requestId, status: "APPROVED" };
  });
}

async function releaseToSeller({ locationId, requestId, storeKeeperId }) {
  return db.transaction(async (tx) => {
    const reqRows = await tx
      .select()
      .from(stockRequests)
      .where(
        and(
          eq(stockRequests.id, requestId),
          eq(stockRequests.locationId, locationId),
        ),
      );

    const req = reqRows[0];
    if (!req) throw new Error("Request not found");

    if (req.status !== "APPROVED") {
      const err = new Error("Invalid status");
      err.code = "BAD_STATUS";
      throw err;
    }

    const lines = await tx
      .select()
      .from(stockRequestItems)
      .where(eq(stockRequestItems.requestId, requestId));

    for (const line of lines) {
      const qty = line.qtyApproved || 0;
      if (qty <= 0) continue;

      await tx
        .insert(inventoryBalances)
        .values({ locationId, productId: line.productId, qtyOnHand: 0 })
        .onConflictDoNothing();

      await tx
        .insert(sellerHoldings)
        .values({
          locationId,
          sellerId: req.sellerId,
          productId: line.productId,
          qtyOnHand: 0,
        })
        .onConflictDoNothing();

      const balRows = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.locationId, locationId),
            eq(inventoryBalances.productId, line.productId),
          ),
        );

      const storeBal = balRows[0];

      if (storeBal.qtyOnHand < qty) {
        const err = new Error("Insufficient stock in warehouse");
        err.code = "INSUFFICIENT_STOCK";
        err.debug = {
          productId: line.productId,
          available: storeBal.qtyOnHand,
          needed: qty,
        };
        throw err;
      }

      await tx
        .update(inventoryBalances)
        .set({ qtyOnHand: storeBal.qtyOnHand - qty, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryBalances.locationId, locationId),
            eq(inventoryBalances.productId, line.productId),
          ),
        );

      const sellerRows = await tx
        .select()
        .from(sellerHoldings)
        .where(
          and(
            eq(sellerHoldings.locationId, locationId),
            eq(sellerHoldings.sellerId, req.sellerId),
            eq(sellerHoldings.productId, line.productId),
          ),
        );

      const sh = sellerRows[0];
      const newSellerQty = sh.qtyOnHand + qty;

      await tx
        .update(sellerHoldings)
        .set({ qtyOnHand: newSellerQty, updatedAt: new Date() })
        .where(eq(sellerHoldings.id, sh.id));
    }

    await tx
      .update(stockRequests)
      .set({ status: "RELEASED" })
      .where(eq(stockRequests.id, requestId));

    // ✅ FIX: include locationId
    await tx.insert(auditLogs).values({
      locationId,
      userId: storeKeeperId,
      action: "STOCK_RELEASE_TO_SELLER",
      entity: "stock_request",
      entityId: requestId,
      description: `Released request #${requestId} to seller ${req.sellerId}`,
    });

    return { id: requestId, status: "RELEASED" };
  });
}

module.exports = {
  createRequest,
  approveOrReject,
  releaseToSeller,
  listRequests,
};
