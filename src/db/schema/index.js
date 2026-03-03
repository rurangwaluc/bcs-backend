// src/db/schema/index.js
module.exports = {
  // Core
  users: require("./users.schema"),
  locations: require("./locations.schema"),
  sessions: require("./sessions.schema"),
  roles: require("./roles.schema"),

  // Catalog
  products: require("./products.schema"),
  customers: require("./customers.schema"),

  // Inventory (explicit exports: no "inventory" blob)
  inventoryBalances: require("./inventory_balances.schema"),
  inventoryArrivals: require("./inventory_arrivals.schema"),
  inventoryArrivalDocuments: require("./inventory_arrival_documents.schema"),
  inventoryAdjustmentRequests: require("./inventory_adjustment_requests.schema"),
  sellerHoldings: require("./seller_holdings.schema"),

  // Stock requests
  stockRequests: require("./stock_requests.schema"),
  stockRequestItems: require("./stock_request_items.schema"),

  // Sales
  sales: require("./sales.schema"),
  saleItems: require("./sale_items.schema"),

  // Money
  payments: require("./payments.schema"),
  credits: require("./credits.schema"),
  cashSessions: require("./cash_sessions.schema"),
  cashLedger: require("./cash_ledger.schema"),
  cashReconciliations: require("./cash_reconciliations.schema"),
  expenses: require("./expenses.schema"),
  cashbookDeposits: require("./cashbook_deposits.schema"),

  // Refunds (pro)
  refunds: require("./refunds.schema"),
  refundItems: require("./refund_items.schema"),

  // Audit / Notes
  auditLogs: require("./audit_logs.schema"),
  notes: require("./notes.schema"),
  internalNotes: require("./internal_notes.schema"),
  notifications: require("./notifications.schema"),
};
