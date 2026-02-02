// backend/src/config/db.js
const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { env } = require("./env");

// Single shared pool for the entire app
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10
});

// Drizzle instance (schemas come later)
const db = drizzle(pool);

// Small helper to test connectivity
async function pingDb() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1 as ok");
    return true;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  db,
  pingDb
};
