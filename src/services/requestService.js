"use strict";

const { db } = require("../config/db");
const { sql, and, eq, desc } = require("drizzle-orm");

const { stockRequests } = require("../db/schema/stock_requests.schema");
const {
  stockRequestItems,
} = require("../db/schema/stock_request_items.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { sellerHoldings } = require("../db/schema/seller_holdings.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { users } = require("../db/schema/users.schema");

const notificationService = require("./notificationService");

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function cleanText(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function normalizeItems(items) {
  const arr = Array.isArray(items) ? items : [];
  const out = [];
  for (const it of arr) {
    const productId = toInt(it?.productId);
    const qty = toInt(it?.qty);
    if (productId > 0 && qty > 0) out.push({ productId, qty });
  }
  return out;
}

async function listRequests({
  locationId,
  sellerId,
  status,
  page = 1,
  limit = 20,
}) {
  const locId = toInt(locationId);
  if (!locId) {
    const err = new Error("Invalid locationId");
    err.code = "BAD_LOCATION";
    throw err;
  }

  const p = Math.max(1, toInt(page) || 1);
  const l = Math.max(1, Math.min(100, toInt(limit) || 20));
  const offset = (p - 1) * l;

  const where = [eq(stockRequests.locationId, locId)];

  if (sellerId) where.push(eq(stockRequests.sellerId, toInt(sellerId)));
  if (status)
    where.push(eq(stockRequests.status, String(status).toUpperCase()));

  const totalRes = await db.execute(sql`
    SELECT COUNT(*)::int as c
    FROM stock_requests
    WHERE location_id = ${locId}
    ${sellerId ? sql`AND seller_id = ${toInt(sellerId)}` : sql``}
    ${status ? sql`AND status = ${String(status).toUpperCase()}` : sql``}
  `);
  const total = Number((totalRes.rows || totalRes || [])[0]?.c || 0);

  const rows = await db
    .select({
      id: stockRequests.id,
      locationId: stockRequests.locationId,
      sellerId: stockRequests.sellerId,
      status: stockRequests.status,
      note: stockRequests.note,
      createdAt: stockRequests.createdAt,
      approvedAt: stockRequests.approvedAt,
      approvedBy: stockRequests.approvedBy,
      rejectedAt: stockRequests.rejectedAt,
      rejectedBy: stockRequests.rejectedBy,
      releasedAt: stockRequests.releasedAt,
      releasedBy: stockRequests.releasedBy,
      sellerName: users.name,
      sellerEmail: users.email,
    })
    .from(stockRequests)
    .leftJoin(users, eq(users.id, stockRequests.sellerId))
    .where(and(...where))
    .orderBy(desc(stockRequests.id))
    .limit(l)
    .offset(offset);

  return { requests: rows || [], page: p, limit: l, total };
}

async function createRequest({ locationId, sellerId, note, items }) {
  const locId = toInt(locationId);
  const sid = toInt(sellerId);
  const cleanNote = cleanText(note, 500);
  const cleanItems = normalizeItems(items);

  if (!locId) {
    const err = new Error("Invalid locationId");
    err.code = "BAD_LOCATION";
    throw err;
  }
  if (!sid) {
    const err = new Error("Invalid sellerId");
    err.code = "BAD_SELLER";
    throw err;
  }
  if (cleanItems.length === 0) {
    const err = new Error("No items");
    err.code = "NO_ITEMS";
    throw err;
  }

  return db.transaction(async (tx) => {
    const [reqRow] = await tx
      .insert(stockRequests)
      .values({
        locationId: locId,
        sellerId: sid,
        status: "PENDING",
        note: cleanNote,
        createdAt: new Date(),
      })
      .returning();

    for (const it of cleanItems) {
      await tx.insert(stockRequestItems).values({
        requestId: reqRow.id,
        productId: it.productId,
        qty: it.qty,
      });
    }

    await tx.insert(auditLogs).values({
      locationId: locId,
      userId: sid,
      action: "STOCK_REQUEST_CREATE",
      entity: "stock_request",
      entityId: reqRow.id,
      description: `Stock request #${reqRow.id} created`,
    });

    // 🔔 URGENT: notify storekeepers in same location
    await notificationService.notifyRoles({
      locationId: locId,
      roles: ["store_keeper"],
      actorUserId: sid,
      type: "STOCK_REQUEST_CREATED",
      title: "New stock request",
      body: `New stock request. Ref: ${String(reqRow.id).padStart(4, "0")}.`,
      priority: "high",
      entity: "stock_request",
      entityId: reqRow.id,
    });

    return reqRow;
  });
}

async function approveOrReject({
  locationId,
  requestId,
  managerId,
  decision,
  note,
}) {
  const locId = toInt(locationId);
  const rid = toInt(requestId);
  const mid = toInt(managerId);
  const dec = String(decision || "").toUpperCase();
  const cleanNote = cleanText(note, 500);

  if (!locId || !rid || !mid) {
    const err = new Error("Invalid input");
    err.code = "BAD_INPUT";
    throw err;
  }
  if (!["APPROVE", "REJECT"].includes(dec)) {
    const err = new Error("Invalid decision");
    err.code = "BAD_DECISION";
    throw err;
  }

  return db.transaction(async (tx) => {
    const reqRes = await tx
      .select()
      .from(stockRequests)
      .where(
        and(eq(stockRequests.id, rid), eq(stockRequests.locationId, locId)),
      )
      .limit(1);

    const reqRow = reqRes[0];
    if (!reqRow) {
      const err = new Error("Request not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (String(reqRow.status || "").toUpperCase() !== "PENDING") {
      const err = new Error("Bad status");
      err.code = "BAD_STATUS";
      throw err;
    }

    const now = new Date();

    if (dec === "APPROVE") {
      await tx
        .update(stockRequests)
        .set({
          status: "APPROVED",
          approvedAt: now,
          approvedBy: mid,
          note: cleanNote || reqRow.note,
        })
        .where(eq(stockRequests.id, rid));

      await tx.insert(auditLogs).values({
        locationId: locId,
        userId: mid,
        action: "STOCK_REQUEST_APPROVE",
        entity: "stock_request",
        entityId: rid,
        description: `Stock request #${rid} approved`,
      });

      // notify seller
      await notificationService.createNotification({
        locationId: locId,
        recipientUserId: reqRow.sellerId,
        actorUserId: mid,
        type: "STOCK_REQUEST_APPROVED",
        title: "Stock request approved",
        body: `Your stock request (#${rid}) was approved.`,
        priority: "normal",
        entity: "stock_request",
        entityId: rid,
      });

      return { ok: true, decision: "APPROVE" };
    }

    // REJECT
    await tx
      .update(stockRequests)
      .set({
        status: "REJECTED",
        rejectedAt: now,
        rejectedBy: mid,
        note: cleanNote || reqRow.note,
      })
      .where(eq(stockRequests.id, rid));

    await tx.insert(auditLogs).values({
      locationId: locId,
      userId: mid,
      action: "STOCK_REQUEST_REJECT",
      entity: "stock_request",
      entityId: rid,
      description: `Stock request #${rid} rejected`,
    });

    await notificationService.createNotification({
      locationId: locId,
      recipientUserId: reqRow.sellerId,
      actorUserId: mid,
      type: "STOCK_REQUEST_REJECTED",
      title: "Stock request rejected",
      body: `Your stock request (#${rid}) was rejected.`,
      priority: "normal",
      entity: "stock_request",
      entityId: rid,
    });

    return { ok: true, decision: "REJECT" };
  });
}

async function releaseToSeller({ locationId, requestId, storeKeeperId }) {
  const locId = toInt(locationId);
  const rid = toInt(requestId);
  const sk = toInt(storeKeeperId);

  if (!locId || !rid || !sk) {
    const err = new Error("Invalid input");
    err.code = "BAD_INPUT";
    throw err;
  }

  return db.transaction(async (tx) => {
    const reqRows = await tx
      .select()
      .from(stockRequests)
      .where(
        and(eq(stockRequests.id, rid), eq(stockRequests.locationId, locId)),
      )
      .limit(1);

    const reqRow = reqRows[0];
    if (!reqRow) {
      const err = new Error("Request not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (String(reqRow.status || "").toUpperCase() !== "APPROVED") {
      const err = new Error("Bad status");
      err.code = "BAD_STATUS";
      throw err;
    }

    const items = await tx
      .select()
      .from(stockRequestItems)
      .where(eq(stockRequestItems.requestId, rid));

    if (!items.length) {
      const err = new Error("No items");
      err.code = "NO_ITEMS";
      throw err;
    }

    // Deduct inventory + add to seller holdings
    for (const it of items) {
      const pid = toInt(it.productId);
      const qty = toInt(it.qty);

      // Ensure inventory row exists
      await tx
        .insert(inventoryBalances)
        .values({ locationId: locId, productId: pid, qtyOnHand: 0 })
        .onConflictDoNothing();

      const invRows = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.locationId, locId),
            eq(inventoryBalances.productId, pid),
          ),
        )
        .limit(1);

      const inv = invRows[0];
      const current = toInt(inv?.qtyOnHand);
      const next = current - qty;

      if (next < 0) {
        const err = new Error("Insufficient stock");
        err.code = "INSUFFICIENT_STOCK";
        err.debug = { productId: pid, available: current, needed: qty };
        throw err;
      }

      await tx
        .update(inventoryBalances)
        .set({ qtyOnHand: next, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryBalances.locationId, locId),
            eq(inventoryBalances.productId, pid),
          ),
        );

      // Upsert seller holding
      await tx
        .insert(sellerHoldings)
        .values({
          locationId: locId,
          sellerId: reqRow.sellerId,
          productId: pid,
          qtyOnHand: qty,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            sellerHoldings.locationId,
            sellerHoldings.sellerId,
            sellerHoldings.productId,
          ],
          set: {
            qtyOnHand: sql`${sellerHoldings.qtyOnHand} + ${qty}`,
            updatedAt: new Date(),
          },
        });
    }

    const now = new Date();
    await tx
      .update(stockRequests)
      .set({
        status: "RELEASED",
        releasedAt: now,
        releasedBy: sk,
      })
      .where(eq(stockRequests.id, rid));

    await tx.insert(auditLogs).values({
      locationId: locId,
      userId: sk,
      action: "STOCK_REQUEST_RELEASE",
      entity: "stock_request",
      entityId: rid,
      description: `Stock request #${rid} released to seller`,
    });

    // notify seller
    await notificationService.createNotification({
      locationId: locId,
      recipientUserId: reqRow.sellerId,
      actorUserId: sk,
      type: "STOCK_REQUEST_RELEASED",
      title: "Stock released",
      body: `Your stock request (#${rid}) has been released.`,
      priority: "normal",
      entity: "stock_request",
      entityId: rid,
    });

    return { ok: true };
  });
}

module.exports = {
  listRequests,
  createRequest,
  approveOrReject,
  releaseToSeller,
};
