// backend/src/server.js

const { env } = require("./config/env");
const { buildApp } = require("./app");
const { pingDb } = require("./config/db");

// Catch anything that would otherwise crash silently
process.on("uncaughtException", (err) => {
  console.error("❌ UNCAUGHT EXCEPTION");
  console.error(err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ UNHANDLED REJECTION");
  console.error(err);
  process.exit(1);
});

async function start() {
  const app = buildApp();

  // ---- Validate env early ----
  const PORT = Number(env.PORT) || 3000;

  if (!Number.isInteger(PORT) || PORT <= 0) {
    app.log.error({ PORT: env.PORT }, "❌ Invalid PORT environment variable");
    process.exit(1);
  }

  // ---- Database check ----
  try {
    await pingDb();
    app.log.info("✅ Database connected");
  } catch (err) {
    app.log.error({ err }, "❌ Database connection failed");
    process.exit(1);
  }

  // ---- Start server ----
  try {
    await app.listen({
      port: PORT,
      host: "0.0.0.0",
    });

    app.log.info(`🚀 Server running on port ${PORT}`);
  } catch (err) {
    app.log.error({ err }, "❌ Server failed to start");
    process.exit(1);
  }
}

start();
