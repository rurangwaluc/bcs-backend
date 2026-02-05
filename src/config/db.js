// backend/src/config/db.js
const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { env } = require("./env");

/**
 * Railway Postgres (proxy.rlwy.net) can present a TLS chain that Node rejects as:
 *   SELF_SIGNED_CERT_IN_CHAIN
 *
 * psql works because libpq SSL behavior differs.
 *
 * We enable SSL and (by default) DO NOT reject unauthorized certs when we detect SSL.
 * You can force verification later with:
 *   PG_SSL_REJECT_UNAUTHORIZED=true
 */
function shouldUseSsl(urlStr) {
  const u = String(urlStr || "").toLowerCase();
  if (!u) return false;
  if (u.includes("sslmode=disable")) return false;

  if (
    u.includes("sslmode=require") ||
    u.includes("sslmode=verify-ca") ||
    u.includes("sslmode=verify-full") ||
    u.includes("ssl=true")
  ) {
    return true;
  }

  return u.includes("proxy.rlwy.net") || u.includes(".railway.app");
}

function shouldRejectUnauthorized() {
  const v = String(process.env.PG_SSL_REJECT_UNAUTHORIZED || "")
    .trim()
    .toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function stripSslQueryParams(connectionString) {
  // pg / pg-connection-string may treat sslmode in a way that conflicts with explicit ssl object.
  // We control SSL via pool.ssl, so remove SSL query params to avoid surprises.
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
const useSsl = shouldUseSsl(rawUrl);
const rejectUnauthorized = shouldRejectUnauthorized();

// IMPORTANT: drizzle uses this pool
const pool = new Pool({
  connectionString: stripSslQueryParams(rawUrl),
  max: 10,
  ...(useSsl
    ? {
        ssl: {
          rejectUnauthorized,
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
    ssl: useSsl,
    rejectUnauthorized,
    strippedSslParams: true,
  });
} catch {
  // ignore
}

async function pingDb() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1 as ok");
    return true;
  } finally {
    client.release();
  }
}

module.exports = { pool, db, pingDb };
