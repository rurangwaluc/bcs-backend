const { db } = require("../config/db");

// NOTE: Update these imports to match your actual schema file paths/names.
const { users } = require("../db/schema/users.schema");
const { sales } = require("../db/schema/sales.schema");
const { payments } = require("../db/schema/payments.schema");
const { products } = require("../db/schema/products.schema");

async function listLocations() {
  // If you have a locations table, use it instead.
  // Minimal fallback: derive locations from users.
  const rows = await db.select({ locationId: users.locationId }).from(users);
  const uniq = [...new Set(rows.map((r) => r.locationId))].filter(Boolean);
  return uniq.map((id) => ({ id, name: `Location ${id}` }));
}

async function getOwnerSummary({ locationId = null }) {
  // Minimal numbers (expand later)
  // If you want per-location stats: group in SQL later.

  // If you have a better schema, replace this with proper aggregate queries.
  // For now: pull and count (OK for small Phase 1 data).
  const allUsers = await db.select().from(users);
  const allSales = await db.select().from(sales);
  const allPayments = await db.select().from(payments);
  const allProducts = await db.select().from(products);

  const f = (row) => (locationId ? row.locationId === locationId : true);

  return {
    locationId,
    usersCount: allUsers.filter(f).length,
    productsCount: allProducts.filter(f).length,
    salesCount: allSales.filter(f).length,
    paymentsCount: allPayments.filter(f).length,
  };
}

module.exports = { listLocations, getOwnerSummary };
