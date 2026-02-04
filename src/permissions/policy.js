// backend/src/permissions/policy.js
const ROLES = require("./roles");
const ACTIONS = require("./actions");

// Only include real action strings (avoid including ACTIONS.__ALIASES__ object)
const ALL_ACTION_STRINGS = Object.values(ACTIONS).filter(
  (v) => typeof v === "string",
);

// Alias maps (legacy <-> canonical)
const ALIASES = ACTIONS.__ALIASES__ || {};
const REVERSE_ALIASES = (() => {
  const reverse = {};
  for (const [legacy, targets] of Object.entries(ALIASES)) {
    for (const t of targets) {
      if (!reverse[t]) reverse[t] = new Set();
      reverse[t].add(legacy);
    }
  }
  return reverse;
})();

const policy = {
  // Owner: everything
  [ROLES.OWNER]: [...ALL_ACTION_STRINGS],

  // Admin: full operations (but not OWNER_ONLY)
  [ROLES.ADMIN]: [
    // Core
    ACTIONS.AUTH_ME,
    ACTIONS.DASHBOARD_VIEW,
    ACTIONS.DASHBOARD_OWNER_VIEW,
    ACTIONS.REPORT_VIEW,
    ACTIONS.REPORTS_DOWNLOAD,
    ACTIONS.AUDIT_VIEW,
    ACTIONS.MESSAGE_CREATE,
    ACTIONS.MESSAGE_VIEW,

    // Users / Locations
    ACTIONS.USER_CREATE,
    ACTIONS.USER_VIEW,
    ACTIONS.USER_UPDATE,
    ACTIONS.USER_MANAGE,
    ACTIONS.USER_DELETE,
    ACTIONS.LOCATION_CREATE,
    ACTIONS.LOCATION_VIEW,
    ACTIONS.LOCATION_UPDATE,

    // Products
    ACTIONS.PRODUCT_CREATE,
    ACTIONS.PRODUCT_VIEW,
    ACTIONS.PRODUCT_UPDATE,
    ACTIONS.PRODUCT_PRICE_SET,
    ACTIONS.PRODUCT_PRICING_UPDATE,

    // Inventory
    ACTIONS.INVENTORY_VIEW,
    ACTIONS.INVENTORY_CREATE,
    ACTIONS.INVENTORY_ADJUST,
    ACTIONS.INVENTORY_ARRIVAL_CREATE,
    ACTIONS.INVENTORY_ARRIVAL_VIEW,

    // Inventory adjustment requests
    ACTIONS.INVENTORY_ADJUST_REQUEST_CREATE,
    ACTIONS.INVENTORY_ADJUST_REQUEST_VIEW,
    ACTIONS.INVENTORY_ADJUST_REQUEST_DECIDE,

    // Stock requests
    ACTIONS.STOCK_REQUEST_CREATE,
    ACTIONS.STOCK_REQUEST_VIEW,
    ACTIONS.STOCK_REQUEST_DECIDE,
    ACTIONS.STOCK_RELEASE_TO_SELLER,
    ACTIONS.STOCK_RELEASE_CONFIRM,
    ACTIONS.STOCK_RETURN_CONFIRM,

    // Holdings
    ACTIONS.HOLDINGS_VIEW,
    ACTIONS.HOLDINGS_REQUEST_CREATE,
    ACTIONS.HOLDINGS_REQUEST_VIEW,
    ACTIONS.HOLDINGS_REQUEST_DECIDE,

    // Customers
    ACTIONS.CUSTOMER_VIEW,
    ACTIONS.CUSTOMER_CREATE,
    ACTIONS.CUSTOMER_UPDATE,

    // Sales / Payments
    ACTIONS.SALE_CREATE,
    ACTIONS.SALE_VIEW,
    ACTIONS.SALE_MARK,
    ACTIONS.SALE_CANCEL,

    // ✅ NEW: allow admin to fulfill sales too
    ACTIONS.SALE_FULFILL,

    ACTIONS.PAYMENT_RECORD,
    ACTIONS.PAYMENT_VIEW,

    // Credit
    ACTIONS.CREDIT_CREATE,
    ACTIONS.CREDIT_VIEW,
    ACTIONS.CREDIT_DECIDE,

    // Refunds
    ACTIONS.REFUND_CREATE,
    ACTIONS.REFUND_VIEW,

    // Cash / Cashier Ops
    ACTIONS.CASH_SESSION_VIEW,
    ACTIONS.CASH_SESSION_OPEN,
    ACTIONS.CASH_SESSION_CLOSE,
    ACTIONS.CASH_DEPOSIT_VIEW,
    ACTIONS.CASH_DEPOSIT_CREATE,
    ACTIONS.EXPENSE_VIEW,
    ACTIONS.EXPENSE_CREATE,
    ACTIONS.CASH_RECONCILE_VIEW,
    ACTIONS.CASH_RECONCILE_CREATE,
    ACTIONS.CASH_REPORT_VIEW,

    // Uploads
    ACTIONS.UPLOAD_CREATE,
    ACTIONS.UPLOAD_VIEW,

    // Legacy support (kept)
    ACTIONS.CASH_LEDGER_MANAGE,
    ACTIONS.CREDIT_SETTLE,
  ],

  // Manager: pricing + oversight + approvals
  [ROLES.MANAGER]: [
    // Core
    ACTIONS.AUTH_ME,
    ACTIONS.DASHBOARD_VIEW,
    ACTIONS.REPORT_VIEW,
    ACTIONS.REPORTS_DOWNLOAD,
    ACTIONS.AUDIT_VIEW,
    ACTIONS.MESSAGE_CREATE,
    ACTIONS.MESSAGE_VIEW,

    // Products (pricing control)
    ACTIONS.PRODUCT_VIEW,
    ACTIONS.PRODUCT_UPDATE,
    ACTIONS.PRODUCT_PRICE_SET,
    ACTIONS.PRODUCT_PRICING_UPDATE,
    ACTIONS.PRODUCT_PRICING_MANAGE,

    // Inventory (view + decide requests)
    ACTIONS.INVENTORY_VIEW,
    ACTIONS.INVENTORY_ARRIVAL_VIEW,
    ACTIONS.INVENTORY_ADJUST_REQUEST_VIEW,
    ACTIONS.INVENTORY_ADJUST_REQUEST_DECIDE,

    // Stock requests (decisions)
    ACTIONS.STOCK_REQUEST_VIEW,
    ACTIONS.STOCK_REQUEST_DECIDE,

    // Sales / refunds oversight
    ACTIONS.SALE_VIEW,
    ACTIONS.SALE_CANCEL,
    ACTIONS.REFUND_CREATE,
    ACTIONS.REFUND_VIEW,

    // Payments view
    ACTIONS.PAYMENT_VIEW,

    // Credit decisions
    ACTIONS.CREDIT_VIEW,
    ACTIONS.CREDIT_DECIDE,

    // Cash reporting / recon
    ACTIONS.CASH_REPORT_VIEW,
    ACTIONS.CASH_RECONCILE_VIEW,
    ACTIONS.CASH_RECONCILE_CREATE,

    // Users view only
    ACTIONS.USER_VIEW,

    // Uploads (view only)
    ACTIONS.UPLOAD_VIEW,

    // Legacy support (kept)
    ACTIONS.CREDIT_SETTLE,
  ],

  // Store keeper: stock + requests + arrivals
  [ROLES.STORE_KEEPER]: [
    ACTIONS.INVENTORY_CREATE,
    // Core
    ACTIONS.AUTH_ME,
    ACTIONS.MESSAGE_CREATE,
    ACTIONS.MESSAGE_VIEW,

    // Products
    ACTIONS.PRODUCT_CREATE,
    ACTIONS.PRODUCT_VIEW,

    // Inventory + arrivals
    ACTIONS.INVENTORY_VIEW,
    ACTIONS.INVENTORY_ARRIVAL_CREATE,
    ACTIONS.INVENTORY_ARRIVAL_VIEW,

    // Inventory adjustment requests
    ACTIONS.INVENTORY_ADJUST_REQUEST_CREATE,
    ACTIONS.INVENTORY_ADJUST_REQUEST_VIEW,

    // Stock requests + releases
    ACTIONS.STOCK_REQUEST_VIEW,
    ACTIONS.STOCK_REQUEST_DECIDE,
    ACTIONS.STOCK_RELEASE_TO_SELLER,
    ACTIONS.STOCK_RELEASE_CONFIRM,
    ACTIONS.STOCK_RETURN_CONFIRM,

    // Holdings
    ACTIONS.HOLDINGS_VIEW,

    // ✅ NEW: Storekeeper fulfills sales (Option B)
    ACTIONS.SALE_VIEW,
    ACTIONS.SALE_FULFILL,

    // Uploads
    ACTIONS.UPLOAD_CREATE,
    ACTIONS.UPLOAD_VIEW,

    // Legacy support (kept)
    ACTIONS.STOCK_REQUEST_APPROVE,
  ],

  // Seller
  [ROLES.SELLER]: [
    ACTIONS.AUTH_ME,
    ACTIONS.MESSAGE_CREATE,
    ACTIONS.MESSAGE_VIEW,

    ACTIONS.PRODUCT_VIEW,
    ACTIONS.INVENTORY_VIEW,

    ACTIONS.STOCK_REQUEST_CREATE,
    ACTIONS.STOCK_REQUEST_VIEW,

    ACTIONS.HOLDINGS_VIEW,

    ACTIONS.CUSTOMER_CREATE,
    ACTIONS.CUSTOMER_VIEW,

    ACTIONS.SALE_CREATE,
    ACTIONS.SALE_VIEW,
    ACTIONS.SALE_MARK,

    ACTIONS.CREDIT_CREATE,
    ACTIONS.CREDIT_VIEW,

    ACTIONS.REFUND_VIEW,

    // Uploads (view only)
    ACTIONS.UPLOAD_VIEW,
  ],

  // Cashier
  [ROLES.CASHIER]: [
    ACTIONS.AUTH_ME,
    ACTIONS.MESSAGE_CREATE,
    ACTIONS.MESSAGE_VIEW,

    ACTIONS.SALE_VIEW,
    ACTIONS.CUSTOMER_VIEW,
    ACTIONS.PRODUCT_VIEW,

    ACTIONS.PAYMENT_RECORD,
    ACTIONS.PAYMENT_VIEW,

    ACTIONS.CASH_SESSION_VIEW,
    ACTIONS.CASH_SESSION_OPEN,
    ACTIONS.CASH_SESSION_CLOSE,

    ACTIONS.CASH_DEPOSIT_VIEW,
    ACTIONS.CASH_DEPOSIT_CREATE,

    ACTIONS.EXPENSE_VIEW,
    ACTIONS.EXPENSE_CREATE,

    ACTIONS.CASH_RECONCILE_VIEW,
    ACTIONS.CASH_RECONCILE_CREATE,

    ACTIONS.REFUND_VIEW,

    // Uploads (view only)
    ACTIONS.UPLOAD_VIEW,

    // Legacy support (kept)
    ACTIONS.CREDIT_SETTLE,

    ACTIONS.REFUND_CREATE,
  ],
};

function can(role, action) {
  const allowed = policy[role] || [];
  if (!action) return false;

  // Direct
  if (allowed.includes(action)) return true;

  // If required action is legacy, allow any canonical target
  const forward = ALIASES[action];
  if (Array.isArray(forward) && forward.some((a) => allowed.includes(a))) {
    return true;
  }

  // If required action is canonical, allow any legacy permission that maps to it
  const reverseSet = REVERSE_ALIASES[action];
  if (reverseSet) {
    for (const legacy of reverseSet) {
      if (allowed.includes(legacy)) return true;
    }
  }

  return false;
}

module.exports = { policy, can };
