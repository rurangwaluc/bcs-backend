const { db } = require("../config/db");
const { inventoryArrivals } = require("../db/schema/inventory_arrivals.schema");
const {
  inventoryArrivalDocuments,
} = require("../db/schema/inventory_arrival_documents.schema");
const inventoryService = require("./inventoryService");
const { eq, desc, inArray } = require("drizzle-orm");

async function createArrival({
  locationId,
  userId,
  productId,
  qtyReceived,
  notes,
  documentUrls,
}) {
  if (!Number.isFinite(qtyReceived) || qtyReceived <= 0) {
    const err = new Error("qtyReceived must be > 0");
    err.code = "BAD_QTY";
    throw err;
  }

  const docs = Array.isArray(documentUrls)
    ? documentUrls
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return db.transaction(async (tx) => {
    const [arrival] = await tx
      .insert(inventoryArrivals)
      .values({
        locationId,
        productId,
        qtyReceived,
        notes: notes ? notes.slice(0, 500) : null,
        createdByUserId: userId,
      })
      .returning();

    if (!arrival?.id) throw new Error("Failed to create inventory arrival");

    if (docs.length > 0) {
      await tx.insert(inventoryArrivalDocuments).values(
        docs.map((url) => ({
          arrivalId: arrival.id,
          fileUrl: url,
        })),
      );
    }

    await inventoryService.adjustInventory({
      tx,
      locationId,
      productId,
      qtyChange: qtyReceived,
    });

    return arrival;
  });
}

async function listArrivals({ locationId, limit = 50, offset = 0, productId }) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);

  let query = db
    .select()
    .from(inventoryArrivals)
    .where(eq(inventoryArrivals.locationId, locationId));
  if (productId)
    query = query.where(eq(inventoryArrivals.productId, productId));

  const rows = await query
    .orderBy(desc(inventoryArrivals.id))
    .limit(lim)
    .offset(off);

  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const docRows = await db
    .select()
    .from(inventoryArrivalDocuments)
    .where(inArray(inventoryArrivalDocuments.arrivalId, ids))
    .orderBy(desc(inventoryArrivalDocuments.id));

  const docsByArrivalId = new Map();
  for (const d of docRows) {
    const arr = docsByArrivalId.get(d.arrivalId) || [];
    arr.push({ id: d.id, fileUrl: d.fileUrl, uploadedAt: d.uploadedAt });
    docsByArrivalId.set(d.arrivalId, arr);
  }

  return rows.map((a) => ({
    ...a,
    documents: docsByArrivalId.get(a.id) || [],
  }));
}

module.exports = { createArrival, listArrivals };
