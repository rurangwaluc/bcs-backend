const { db } = require("../config/db");
const { locations } = require("../db/schema/locations.schema");
const { eq } = require("drizzle-orm");

async function getLocationById(locationId) {
  if (locationId == null) return null;

  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      email: locations.email,
      phone: locations.phone,
      website: locations.website,
      logoUrl: locations.logoUrl,
      address: locations.address,
      tin: locations.tin,
      momoCode: locations.momoCode,
      bankAccounts: locations.bankAccounts,
    })
    .from(locations)
    .where(eq(locations.id, Number(locationId)));

  const l = rows[0];
  if (!l) return null;

  return {
    id: String(l.id),
    name: l.name,
    code: l.code,
    email: l.email || null,
    phone: l.phone || null,
    website: l.website || null,
    logoUrl: l.logoUrl || null,
    address: l.address || null,
    tin: l.tin || null,
    momoCode: l.momoCode || null,
    bankAccounts: Array.isArray(l.bankAccounts) ? l.bankAccounts : [],
  };
}

module.exports = { getLocationById };
