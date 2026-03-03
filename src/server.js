// backend/src/server.js

// ✅ Development-only: ignore self-signed SSL errors
if (process.env.NODE_ENV === "development") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// ✅ Load environment variables BEFORE anything else
require("dotenv").config();

const { env } = require("./config/env");
const { buildApp } = require("./app");
const { pingDb } = require("./config/db");

// 🔹 Global error handlers for uncaught exceptions/rejections
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
  let app;

  // 🔹 Build Fastify app
  try {
    app = buildApp();
  } catch (err) {
    console.error("❌ Fastify buildApp failed");
    console.error(err);
    process.exit(1);
  }

  const PORT = Number(env.PORT) || 4000;

  // 🔹 Test database connection
  try {
    await pingDb();
    app.log.info("✅ Database connected");
  } catch (err) {
    app.log.error({ err }, "❌ Database connection failed");
    process.exit(1);
  }

  // 🔹 Start server
  try {
    await app.listen({
      port: PORT,
      host: "0.0.0.0",
    });
    app.log.info(`🚀 Server running on port ${PORT}`);
  } catch (err) {
    app.log.error("❌ Server failed to start");
    app.log.error(err);
    process.exit(1);
  }
}

// 🔹 Launch the app
start();