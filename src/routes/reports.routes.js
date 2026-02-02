const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  dailyReport,
  weeklyReport,
  monthlyReport,

  // ✅ CASH REPORTS
  cashSummaryReport,
  cashSessionsReport,
  cashLedgerReport,
  cashRefundsReport,
} = require("../controllers/reportsController");

async function reportsRoutes(app) {
  // --------------------------------------------------
  // Existing PDF reports (downloads)
  // --------------------------------------------------
  app.get(
    "/reports/daily",
    { preHandler: [requirePermission(ACTIONS.REPORTS_DOWNLOAD)] },
    dailyReport,
  );

  app.get(
    "/reports/weekly",
    { preHandler: [requirePermission(ACTIONS.REPORTS_DOWNLOAD)] },
    weeklyReport,
  );

  app.get(
    "/reports/monthly",
    { preHandler: [requirePermission(ACTIONS.REPORTS_DOWNLOAD)] },
    monthlyReport,
  );

  // --------------------------------------------------
  // ✅ Cash reports (JSON for dashboards)
  // Permission: CASH_REPORT_VIEW
  // --------------------------------------------------

  // Summary totals (IN/OUT + per type + per method)
  app.get(
    "/cash/reports/summary",
    { preHandler: [requirePermission(ACTIONS.CASH_REPORT_VIEW)] },
    cashSummaryReport,
  );

  // Sessions list + session totals
  app.get(
    "/cash/reports/sessions",
    { preHandler: [requirePermission(ACTIONS.CASH_REPORT_VIEW)] },
    cashSessionsReport,
  );

  // Cash ledger list (for auditing money movement)
  app.get(
    "/cash/reports/ledger",
    { preHandler: [requirePermission(ACTIONS.CASH_REPORT_VIEW)] },
    cashLedgerReport,
  );

  // Refunds list (cash-related)
  app.get(
    "/cash/reports/refunds",
    { preHandler: [requirePermission(ACTIONS.CASH_REPORT_VIEW)] },
    cashRefundsReport,
  );
}

module.exports = { reportsRoutes };
