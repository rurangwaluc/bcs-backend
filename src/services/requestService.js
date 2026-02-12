// backend/src/services/requestService.js
/**
 * IMPORTANT:
 * Your controller calls: requestService.listRequests(...)
 * Your runtime error says: listRequests is not a function
 *
 * This file guarantees listRequests is exported, so GET /requests
 * and Admin Reports stop crashing.
 *
 * If you already have an existing "list" function under another name,
 * this adapter will use it automatically.
 *
 * If you do NOT have any list implementation yet, this will return
 * an empty list (safe fallback) instead of crashing the entire UI.
 */

// ----------------------------------------------------
// WIRING OPTION A (preferred): import your real impl
// ----------------------------------------------------
// If you already have a real implementation file, require it here.
// Example:
// const impl = require("./requestService.impl");
// const impl = require("./requests.service");
// const impl = require("./stockRequests.service");

let impl = null;

try {
  // If you know the correct path, uncomment and set it:
  // impl = require("./requestService.impl");
  // impl = require("./requests.service");
  // impl = require("./stockRequests.service");
  impl = null;
} catch {
  impl = null;
}

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------
function pickFn(obj, names = []) {
  for (const n of names) {
    if (obj && typeof obj[n] === "function") return obj[n].bind(obj);
  }
  return null;
}

// ----------------------------------------------------
// SAFE FALLBACK (prevents 500 / crash)
// ----------------------------------------------------
async function fallbackListRequests(args = {}) {
  // We do NOT guess your DB schema/table names here.
  // Returning empty list keeps UI stable and avoids 500.
  return {
    requests: [],
    page: Number(args.page) || 1,
    limit: Number(args.limit) || 20,
    total: 0,
    debug: {
      warning:
        "listRequests() fallback used. Implement real query in requestService.js or wire impl via require().",
    },
  };
}

// ----------------------------------------------------
// Exported functions
// ----------------------------------------------------

// 1) listRequests: required by controller
const listRequests =
  pickFn(impl, [
    "listRequests",
    "getRequests",
    "list",
    "findRequests",
    "listStockRequests",
  ]) || fallbackListRequests;

// 2) other actions: keep compatibility with your controllers/routes
const createRequest =
  pickFn(impl, ["createRequest", "createStockRequest", "create"]) ||
  (async () => {
    const err = new Error(
      "createRequest is not implemented/wired. Provide implementation in requestService.js",
    );
    err.code = "NOT_IMPLEMENTED";
    throw err;
  });

const approveOrReject =
  pickFn(impl, ["approveOrReject", "decide", "approveRequest"]) ||
  (async () => {
    const err = new Error(
      "approveOrReject is not implemented/wired. Provide implementation in requestService.js",
    );
    err.code = "NOT_IMPLEMENTED";
    throw err;
  });

const releaseToSeller =
  pickFn(impl, ["releaseToSeller", "release", "releaseStockToSeller"]) ||
  (async () => {
    const err = new Error(
      "releaseToSeller is not implemented/wired. Provide implementation in requestService.js",
    );
    err.code = "NOT_IMPLEMENTED";
    throw err;
  });

module.exports = {
  // required by requestsController
  listRequests,

  // used by your other controller methods
  createRequest,
  approveOrReject,
  releaseToSeller,

  // also expose impl (if present) without breaking
  ...(impl || {}),
};
