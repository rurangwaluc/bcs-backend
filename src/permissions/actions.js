/**
 * Unified Actions / Permissions
 * - Backward compatible with legacy permissions
 * - Explicit CRUD-style actions
 * - Safe across API + UI
 */

const ACTIONS = {
  // =====================
  // Auth
  // =====================
  AUTH_ME: "AUTH_ME",

  // =====================
  // Users
  // =====================
  USER_CREATE: "USER_CREATE",
  USER_VIEW: "USER_VIEW",
  USER_UPDATE: "USER_UPDATE",
  USER_DELETE: "USER_DELETE",

  // Legacy
  USER_MANAGE: "USER_MANAGE",

  // =====================
  // Roles / ownership
  // =====================
  OWNER_ONLY: "OWNER_ONLY",

  // =====================
  // Dashboard / Reports
  // =====================
  DASHBOARD_VIEW: "DASHBOARD_VIEW",
  DASHBOARD_OWNER_VIEW: "DASHBOARD_OWNER_VIEW",
  REPORT_VIEW: "REPORT_VIEW",
  REPORTS_DOWNLOAD: "REPORTS_DOWNLOAD",

  // =====================
  // Locations
  // =====================
  LOCATION_CREATE: "LOCATION_CREATE",
  LOCATION_VIEW: "LOCATION_VIEW",
  LOCATION_UPDATE: "LOCATION_UPDATE",

  // =====================
  // Products
  // =====================
  PRODUCT_CREATE: "PRODUCT_CREATE",
  PRODUCT_VIEW: "PRODUCT_VIEW",
  PRODUCT_UPDATE: "PRODUCT_UPDATE",
  PRODUCT_PRICE_SET: "PRODUCT_PRICE_SET",
  PRODUCT_PRICING_UPDATE: "PRODUCT_PRICING_UPDATE",

  // Legacy
  PRODUCT_PRICING_MANAGE: "PRODUCT_PRICING_MANAGE",

  // =====================
  // Customers
  // =====================
  CUSTOMER_VIEW: "CUSTOMER_VIEW",
  CUSTOMER_CREATE: "CUSTOMER_CREATE",
  CUSTOMER_UPDATE: "CUSTOMER_UPDATE",

  // =====================
  // Inventory
  // =====================
  INVENTORY_VIEW: "INVENTORY_VIEW",
  INVENTORY_CREATE: "INVENTORY_CREATE",
  INVENTORY_ADJUST: "INVENTORY_ADJUST",
  INVENTORY_MANAGE: "INVENTORY_MANAGE",

  // =====================
  // Inventory arrivals
  // =====================
  INVENTORY_ARRIVAL_CREATE: "INVENTORY_ARRIVAL_CREATE",
  INVENTORY_ARRIVAL_VIEW: "INVENTORY_ARRIVAL_VIEW",

  // =====================
  // Inventory adjustment requests
  // =====================
  INVENTORY_ADJUST_REQUEST_CREATE: "INVENTORY_ADJUST_REQUEST_CREATE",
  INVENTORY_ADJUST_REQUEST_VIEW: "INVENTORY_ADJUST_REQUEST_VIEW",
  INVENTORY_ADJUST_REQUEST_DECIDE: "INVENTORY_ADJUST_REQUEST_DECIDE",

  // Legacy short names
  INV_ADJ_REQ_CREATE: "INV_ADJ_REQ_CREATE",
  INV_ADJ_REQ_VIEW: "INV_ADJ_REQ_VIEW",
  INV_ADJ_REQ_DECIDE: "INV_ADJ_REQ_DECIDE",

  // =====================
  // Stock requests / movement
  // =====================
  STOCK_REQUEST_CREATE: "STOCK_REQUEST_CREATE",
  STOCK_REQUEST_VIEW: "STOCK_REQUEST_VIEW",
  STOCK_REQUEST_DECIDE: "STOCK_REQUEST_DECIDE",

  // Confirmations
  STOCK_RELEASE_CONFIRM: "STOCK_RELEASE_CONFIRM",
  STOCK_RETURN_CONFIRM: "STOCK_RETURN_CONFIRM",

  // ✅ Used by /requests/:id/release route (and policy)
  STOCK_RELEASE_TO_SELLER: "STOCK_RELEASE_TO_SELLER",

  // Legacy
  STOCK_REQUEST_APPROVE: "STOCK_REQUEST_APPROVE",
  STOCK_REQUEST_DECLINE: "STOCK_REQUEST_DECLINE",
  STOCK_REQUEST_RELEASE: "STOCK_REQUEST_RELEASE",

  // =====================
  // Holdings
  // =====================
  HOLDINGS_VIEW: "HOLDINGS_VIEW",
  HOLDINGS_ADJUST: "HOLDINGS_ADJUST",
  HOLDINGS_REQUEST_CREATE: "HOLDINGS_REQUEST_CREATE",
  HOLDINGS_REQUEST_VIEW: "HOLDINGS_REQUEST_VIEW",
  HOLDINGS_REQUEST_DECIDE: "HOLDINGS_REQUEST_DECIDE",

  // =====================
  // Sales
  // =====================
  SALE_CREATE: "SALE_CREATE",
  SALE_VIEW: "SALE_VIEW",
  SALE_FULFILL: "SALE_FULFILL",
  SALE_MARK: "SALE_MARK",
  SALE_CANCEL: "SALE_CANCEL",

  // ✅ NEW (Option B): Storekeeper fulfills a draft sale (deduct inventory)
  SALE_FULFILL: "SALE_FULFILL",

  // =====================
  // Payments / Cash
  // =====================
  PAYMENT_RECORD: "PAYMENT_RECORD",
  PAYMENT_VIEW: "PAYMENT_VIEW",

  CASH_SESSION_VIEW: "CASH_SESSION_VIEW",
  CASH_SESSION_OPEN: "CASH_SESSION_OPEN",
  CASH_SESSION_CLOSE: "CASH_SESSION_CLOSE",

  CASH_DEPOSIT_VIEW: "CASH_DEPOSIT_VIEW",
  CASH_DEPOSIT_CREATE: "CASH_DEPOSIT_CREATE",

  EXPENSE_VIEW: "EXPENSE_VIEW",
  EXPENSE_CREATE: "EXPENSE_CREATE",

  CASH_RECONCILE_VIEW: "CASH_RECONCILE_VIEW",
  CASH_RECONCILE_CREATE: "CASH_RECONCILE_CREATE",

  CASH_REPORT_VIEW: "CASH_REPORT_VIEW",

  // Legacy
  CASH_LEDGER_MANAGE: "CASH_LEDGER_MANAGE",

  // =====================
  // Credits
  // =====================
  CREDIT_CREATE: "CREDIT_CREATE",
  CREDIT_VIEW: "CREDIT_VIEW",
  CREDIT_DECIDE: "CREDIT_DECIDE",

  // Legacy
  CREDIT_READ: "CREDIT_READ",
  CREDIT_SETTLE: "CREDIT_SETTLE",

  // =====================
  // Refunds
  // =====================
  REFUND_CREATE: "REFUND_CREATE",
  REFUND_VIEW: "REFUND_VIEW",

  // =====================
  // Uploads (files)
  // =====================
  UPLOAD_CREATE: "UPLOAD_CREATE",
  UPLOAD_VIEW: "UPLOAD_VIEW",

  // =====================
  // Audit / Messages
  // =====================
  AUDIT_VIEW: "AUDIT_VIEW",
  MESSAGE_CREATE: "MESSAGE_CREATE",
  MESSAGE_VIEW: "MESSAGE_VIEW",
};

/**
 * Alias map for backward compatibility & migrations
 */
ACTIONS.__ALIASES__ = {
  USER_MANAGE: ["USER_UPDATE", "USER_DELETE"],
  PRODUCT_PRICING_MANAGE: ["PRODUCT_PRICE_SET"],

  REPORT_VIEW: ["REPORTS_DOWNLOAD"],

  INV_ADJ_REQ_CREATE: ["INVENTORY_ADJUST_REQUEST_CREATE"],
  INV_ADJ_REQ_VIEW: ["INVENTORY_ADJUST_REQUEST_VIEW"],
  INV_ADJ_REQ_DECIDE: ["INVENTORY_ADJUST_REQUEST_DECIDE"],

  STOCK_REQUEST_APPROVE: ["STOCK_REQUEST_DECIDE"],
  STOCK_REQUEST_DECLINE: ["STOCK_REQUEST_DECIDE"],

  // Legacy “release” should satisfy the real release action.
  STOCK_REQUEST_RELEASE: ["STOCK_RELEASE_TO_SELLER", "STOCK_RELEASE_CONFIRM"],

  CREDIT_READ: ["CREDIT_VIEW"],
  CREDIT_SETTLE: ["CREDIT_DECIDE"],

  HOLDINGS_ADJUST: ["HOLDINGS_REQUEST_CREATE", "HOLDINGS_REQUEST_DECIDE"],
};

module.exports = Object.freeze(ACTIONS);
