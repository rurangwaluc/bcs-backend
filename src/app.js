// backend/src/app.js
const fastify = require("fastify");
const rateLimit = require("@fastify/rate-limit");
const cors = require("@fastify/cors");
const cookie = require("@fastify/cookie");
const multipart = require("@fastify/multipart");

const { env } = require("./config/env");
const { sessionAuth } = require("./middleware/sessionAuth");

// Routes
const { authRoutes } = require("./routes/auth.routes");
const { dashboardRoutes } = require("./routes/dashboard.routes");
const { ownerDashboardRoutes } = require("./routes/dashboard.owner.routes");
const { ownerRoutes } = require("./routes/owner.routes"); // ✅ FIX: register owner routes

const { usersRoutes } = require("./routes/users.routes");
const { customersRoutes } = require("./routes/customers.routes");
const { messagesRoutes } = require("./routes/messages.routes");
const { auditRoutes } = require("./routes/audit.routes");

const { inventoryRoutes } = require("./routes/inventory.routes");
const {
  inventoryArrivalRoutes,
} = require("./routes/inventory.arrivals.routes");
const {
  inventoryAdjustRequestsRoutes,
} = require("./routes/inventoryAdjustRequests.routes");

const { productPricingRoutes } = require("./routes/productPricing.routes");
const { holdingsRoutes } = require("./routes/holdings.routes");
const { requestsRoutes } = require("./routes/requests.routes");

const { salesRoutes } = require("./routes/sales.routes");
const { salesReadRoutes } = require("./routes/sales.read.routes");
const { refundsRoutes } = require("./routes/refunds.routes");

const { paymentsRoutes } = require("./routes/payments.routes");
const { paymentsReadRoutes } = require("./routes/payments.read.routes");

const { cashRoutes } = require("./routes/cash.routes");
const { cashSessionsRoutes } = require("./routes/cashSessions.routes");
const { cashbookRoutes } = require("./routes/cashbook.routes");
const { expensesRoutes } = require("./routes/expenses.routes");
const { cashReconcileRoutes } = require("./routes/cashReconcile.routes");

const { creditRoutes } = require("./routes/credit.routes");
const { creditReadRoutes } = require("./routes/credit.read.routes");

const { reportsRoutes } = require("./routes/reports.routes");
const { uploadsRoutes } = require("./routes/uploads.routes");

function buildApp() {
  const app = fastify({ logger: true });

  const corsOrigins = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : true;

  app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Sign cookies using SESSION_SECRET
  app.register(cookie, {
    secret: env.SESSION_SECRET,
    hook: "onRequest",
  });

  // Multipart (uploads) — strict limits at the server boundary.
  app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per file
      files: 5, // max files per request
    },
  });

  app.register(rateLimit, { global: false });

  // Global auth hook
  app.addHook("preHandler", sessionAuth);

  // Health
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  // Auth / dashboards
  app.register(authRoutes);
  app.register(dashboardRoutes);
  app.register(ownerDashboardRoutes);

  // ✅ FIX: Owner endpoints (summary + locations)
  app.register(ownerRoutes);

  // Users / messaging / audit
  app.register(usersRoutes);
  app.register(customersRoutes);
  app.register(messagesRoutes);
  app.register(auditRoutes);

  // Inventory
  app.register(inventoryRoutes);
  app.register(inventoryArrivalRoutes);
  app.register(inventoryAdjustRequestsRoutes);
  app.register(productPricingRoutes);
  app.register(holdingsRoutes);
  app.register(requestsRoutes);

  // Sales / payments
  app.register(salesRoutes);
  app.register(salesReadRoutes);
  app.register(refundsRoutes);
  app.register(paymentsRoutes);
  app.register(paymentsReadRoutes);

  // Cash
  app.register(cashRoutes);
  app.register(cashSessionsRoutes, { prefix: "/cash-sessions" });
  app.register(cashbookRoutes, { prefix: "/cashbook" });
  app.register(expensesRoutes, { prefix: "/cash/expenses" });
  app.register(cashReconcileRoutes, { prefix: "/" });

  // Credit
  app.register(creditRoutes);
  app.register(creditReadRoutes);

  // Reports
  app.register(reportsRoutes);

  // Uploads (authenticated upload + authenticated read)
  app.register(uploadsRoutes);

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 429
        ? "Too Many Requests"
        : error.message || "Internal Server Error";

    reply.status(statusCode).send({
      error: message,
      debug: error.debug || undefined,
    });
  });

  return app;
}

module.exports = { buildApp };
