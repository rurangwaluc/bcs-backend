const { db } = require("../config/db");
const { sellerHoldings } = require("../db/schema/seller_holdings.schema");
const { products } = require("../db/schema/products.schema");
const { eq, and, sql } = require("drizzle-orm");

async function getMyHoldings({ locationId, sellerId }) {
  const result = await db.execute(sql`
    SELECT sh.product_id as "productId",
           p.name as "productName",
           p.sku as "sku",
           p.unit as "unit",
           sh.qty_on_hand as "qtyOnHand",
           sh.updated_at as "updatedAt"
    FROM seller_holdings sh
    JOIN products p ON p.id = sh.product_id
    WHERE sh.location_id = ${locationId}
      AND sh.seller_id = ${sellerId}
    ORDER BY p.name ASC
  `);

  return result.rows || result;
}

async function getSellerHoldings({ locationId, sellerId }) {
  // same output, just for any seller
  return getMyHoldings({ locationId, sellerId });
}

module.exports = { getMyHoldings, getSellerHoldings };
