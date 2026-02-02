// backend/src/server.js
const { env } = require("./config/env");
const { buildApp } = require("./app");
const { pingDb } = require("./config/db");

async function start() {
  const app = buildApp();

  // Optional: fail fast if DB is down (recommended for control systems)
  try {
    await pingDb();
    app.log.info("✅ Database connected");
  } catch (err) {
    app.log.error({ err }, "❌ Database connection failed");
    process.exit(1);
  }

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`🚀 Server running on port ${env.PORT}`);
  } catch (err) {
    app.log.error({ err }, "❌ Server failed to start");
    process.exit(1);
  }
}

start();
