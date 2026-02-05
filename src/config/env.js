// backend/src/config/env.js
const path = require("path");
const dotenv = require("dotenv");

// IMPORTANT:
// - override:true makes .env win over any already-set Windows environment variables
// - explicit path avoids loading a different .env by mistake
dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
  override: true,
});

function required(name, v) {
  const val = (v ?? "").toString().trim();
  if (!val) throw new Error(`Missing env: ${name}`);
  return val;
}

const env = {
  NODE_ENV: (process.env.NODE_ENV || "development").trim(),
  PORT: Number(process.env.PORT || 4000),

  // Must come from .env (and MUST override shell variables)
  DATABASE_URL: required("DATABASE_URL", process.env.DATABASE_URL),

  SESSION_SECRET: required("SESSION_SECRET", process.env.SESSION_SECRET),
  CORS_ORIGIN: (process.env.CORS_ORIGIN || "http://localhost:3000").trim(),
};

module.exports = { env };
