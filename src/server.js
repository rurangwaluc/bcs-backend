// backend/src/server.js

const { env } = require("./config/env");
const { buildApp } = require("./app");
const { pingDb } = require("./config/db");

// DO NOT let Fastify errors hide
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

  try {
    app = buildApp(); // <-- error is likely HERE
  } catch (err) {
    console.error("❌ Fastify buildApp failed");
    console.error(err);
    process.exit(1);
  }

  const PORT = Number(env.PORT) || 3000;

  try {
    await pingDb();
    app.log.info("✅ Database connected");
  } catch (err) {
    app.log.error({ err }, "❌ Database connection failed");
    process.exit(1);
  }

  try {
    await app.listen({
      port: PORT,
      host: "0.0.0.0",
    });

    app.log.info(`🚀 Server running on port ${PORT}`);
  } catch (err) {
    app.log.error("❌ Server failed to start");
    app.log.error(err); // 👈 THIS was missing
    process.exit(1);
  }
}

start();
