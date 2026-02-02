// backend/src/services/inventoryAdjustRequestsService.js

const { db } = require("../config/db");

const {
  inventoryAdjustmentRequests,
} = require("../db/schema/inventory_adjustment_requests.schema");

const { inventoryBalances } = require("../db/schema/inventory.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { products } = require("../db/schema/products.schema");

const { and, eq, desc, sql } = require("drizzle-orm");

/**
 * Create inventory adjustment request
 */
async function createRequest({
  locationId,
  productId,
  qtyChange,
  reason,
  requestedByUserId,
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(inventoryAdjustmentRequests)
      .values({
        locationId,
        productId,
        qtyChange,
        reason,
        status: "PENDING",
        requestedByUserId,
        decidedByUserId: null,
        createdAt: new Date(),
        decidedAt: null,
      })
      .returning();

    // ✅ FIX: audit log must include locationId (DB requires NOT NULL)
    await tx.insert(auditLogs).values({
      locationId,
      userId: requestedByUserId,
      action: "INVENTORY_ADJUST_REQUEST_CREATE",
      entity: "inventory_adjustment_request",
      entityId: row.id,
      description: `Requested inventory adjustment: productId=${productId}, qtyChange=${qtyChange}. reason=${reason || "-"}`,
    });

    return row;
  });
}

/**
 * List inventory adjustment requests
 * ✅ FIXED: removed non-existent managerNote column
 */
async function listRequests({
  locationId,
  role,
  userId,
  status,
  limit = 100,
  offset = 0,
} = {}) {
  if (!locationId) {
    const err = new Error("Missing locationId");
    err.code = "BAD_CONTEXT";
    throw err;
  }

  const where = [eq(inventoryAdjustmentRequests.locationId, locationId)];

  if (role === "store_keeper") {
    where.push(eq(inventoryAdjustmentRequests.requestedByUserId, userId));
  }

  if (status) {
    where.push(
      eq(inventoryAdjustmentRequests.status, String(status).toUpperCase()),
    );
  }

  const rows = await db
    .select({
      id: inventoryAdjustmentRequests.id,
      productId: inventoryAdjustmentRequests.productId,
      qtyChange: inventoryAdjustmentRequests.qtyChange,
      reason: inventoryAdjustmentRequests.reason,
      status: inventoryAdjustmentRequests.status,
      requestedByUserId: inventoryAdjustmentRequests.requestedByUserId,
      decidedByUserId: inventoryAdjustmentRequests.decidedByUserId,
      createdAt: inventoryAdjustmentRequests.createdAt,
      decidedAt: inventoryAdjustmentRequests.decidedAt,

      // ✅ VALID column reference
      productName: products.name,
    })
    .from(inventoryAdjustmentRequests)
    .leftJoin(products, eq(products.id, inventoryAdjustmentRequests.productId))
    .where(and(...where))
    .orderBy(desc(inventoryAdjustmentRequests.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    ...r,
    productName: r.productName || "Unknown Product",
  }));
}

/**
 * Approve / Decline inventory adjustment request
 */
async function decideRequest({
  locationId,
  managerId,
  requestId,
  decision,
  note,
}) {
  return db.transaction(async (tx) => {
    const [reqRow] = await tx
      .select()
      .from(inventoryAdjustmentRequests)
      .where(
        and(
          eq(inventoryAdjustmentRequests.id, requestId),
          eq(inventoryAdjustmentRequests.locationId, locationId),
        ),
      );

    if (!reqRow) {
      const err = new Error("Request not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (reqRow.status !== "PENDING") {
      const err = new Error("Already decided");
      err.code = "ALREADY_DECIDED";
      throw err;
    }

    const nextStatus = decision === "APPROVE" ? "APPROVED" : "DECLINED";

    if (decision === "APPROVE") {
      await tx
        .insert(inventoryBalances)
        .values({
          locationId,
          productId: reqRow.productId,
          qtyOnHand: 0,
        })
        .onConflictDoNothing();

      await tx.execute(sql`
        UPDATE inventory_balances
        SET qty_on_hand = qty_on_hand + ${reqRow.qtyChange},
            updated_at = now()
        WHERE location_id = ${locationId}
          AND product_id = ${reqRow.productId}
      `);
    }

    const [updated] = await tx
      .update(inventoryAdjustmentRequests)
      .set({
        status: nextStatus,
        decidedByUserId: managerId,
        decidedAt: new Date(),
      })
      .where(eq(inventoryAdjustmentRequests.id, requestId))
      .returning();

    // ✅ FIX: audit log must include locationId (DB requires NOT NULL)
    await tx.insert(auditLogs).values({
      locationId,
      userId: managerId,
      action:
        decision === "APPROVE"
          ? "INVENTORY_ADJUST_REQUEST_APPROVE"
          : "INVENTORY_ADJUST_REQUEST_DECLINE",
      entity: "inventory_adjustment_request",
      entityId: requestId,
      description: `Adjustment request #${requestId} ${nextStatus}. note=${note || "-"}`,
    });

    return updated;
  });
}

async function approveRequest({ id, locationId, decidedByUserId }) {
  return decideRequest({
    locationId,
    managerId: decidedByUserId,
    requestId: id,
    decision: "APPROVE",
  });
}

async function declineRequest({ id, locationId, decidedByUserId }) {
  return decideRequest({
    locationId,
    managerId: decidedByUserId,
    requestId: id,
    decision: "DECLINE",
  });
}

module.exports = {
  createRequest,
  listRequests,
  approveRequest,
  declineRequest,
};
