// backend/src/config/env.js
const path = require("path");
const dotenv = require("dotenv");

// Make sure we always load the .env from project root
dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
  override: true,
});

function required(name, v) {
  const val = (v ?? "").toString().trim();
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name, v) {
  const val = (v ?? "").toString().trim();
  return val || null;
}

function parseBool(v, fallback = false) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return s === "true" || s === "1" || s === "yes";
}

const env = {
  NODE_ENV: (process.env.NODE_ENV || "development").trim(),
  PORT: Number(process.env.PORT || 4000),

  DATABASE_URL: required("DATABASE_URL", process.env.DATABASE_URL),

  PG_SSL: parseBool(process.env.PG_SSL, true),
  PG_SSL_REJECT_UNAUTHORIZED: parseBool(
    process.env.PG_SSL_REJECT_UNAUTHORIZED,
    false,
  ),

  SESSION_SECRET: required("SESSION_SECRET", process.env.SESSION_SECRET),

  // CSV list
  CORS_ORIGINS: String(process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // For POST /admin/bootstrap
  BOOTSTRAP_SECRET: optional("BOOTSTRAP_SECRET", process.env.BOOTSTRAP_SECRET),

  // Cookie config (safe defaults)
  COOKIE_DOMAIN: optional("COOKIE_DOMAIN", process.env.COOKIE_DOMAIN),
  COOKIE_SECURE: parseBool(process.env.COOKIE_SECURE, false),
};

module.exports = { env }; 