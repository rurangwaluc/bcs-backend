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
    })
    .from(locations)
    .where(eq(locations.id, Number(locationId)));

  const l = rows[0];
  if (!l) return null;

  return {
    id: String(l.id),
    name: l.name,
    code: l.code,
  };
}

module.exports = { getLocationById };