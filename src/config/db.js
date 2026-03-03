// backend/src/config/db.js
const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { env } = require("./env");

function stripSslQueryParams(connectionString) {
  try {
    const u = new URL(connectionString);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    u.searchParams.delete("sslcert");
    u.searchParams.delete("sslkey");
    u.searchParams.delete("sslrootcert");
    u.searchParams.delete("sslpassword");
    u.searchParams.delete("sslcrl");
    return u.toString();
  } catch {
    return connectionString;
  }
}

const rawUrl = String(env.DATABASE_URL || "").trim();

const pool = new Pool({
  connectionString: stripSslQueryParams(rawUrl),
  max: 10,
  ...(env.PG_SSL
    ? {
        ssl: {
          rejectUnauthorized: env.PG_SSL_REJECT_UNAUTHORIZED,
        },
      }
    : {}),
});

const db = drizzle(pool);

try {
  const u = new URL(rawUrl);
  console.log("DB connect (sanity):", {
    host: u.hostname,
    port: u.port,
    database: u.pathname.replace("/", ""),
    user: u.username,
    ssl: env.PG_SSL,
    rejectUnauthorized: env.PG_SSL_REJECT_UNAUTHORIZED,
  });
} catch {
  // ignore
}

async function pingDb() {
  const client = await pool.connect();
  try {
    await client.query("select 1 as ok");
    return true;
  } finally {
    client.release();
  }
}

module.exports = { pool, db, pingDb };