const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

async function createArrival({
  locationId,
  productId,
  qty,
  reference,
  note,
  userId,
}) {
  const q = sql`
    insert into stock_arrivals (
      location_id,
      product_id,
      qty,
      reference,
      note,
      requested_by_user_id
    )
    values (
      ${locationId},
      ${productId},
      ${qty},
      ${reference},
      ${note},
      ${userId}
    )
    returning *
  `;
  const r = await db.execute(q);
  return r.rows[0];
}

async function listArrivals({ locationId }) {
  const q = sql`
    select *
    from stock_arrivals
    where location_id = ${locationId}
    order by created_at desc
  `;
  const r = await db.execute(q);
  return r.rows;
}

async function approveArrival({ id, locationId, managerId }) {
  const q = sql`
    update stock_arrivals
    set
      status = 'APPROVED',
      decided_by_user_id = ${managerId},
      decided_at = now()
    where id = ${id}
      and location_id = ${locationId}
      and status = 'PENDING'
    returning *
  `;
  const r = await db.execute(q);
  return r.rows[0];
}

module.exports = {
  createArrival,
  listArrivals,
  approveArrival,
};
