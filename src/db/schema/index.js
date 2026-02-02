module.exports = {
  users: require("./users.schema"),
  products: require("./products.schema"),
  inventory: require("./inventory.schema"),
  sellerHoldings: require("./seller_holdings.schema"),

  // stockRequests: require("./stock.requests.schema"),
  // stockTransfers: require("./stock.transfers.schema"),

  sales: require("./sales.schema"),
  saleItems: require("./sale_items.schema"),

  payments: require("./payments.schema"),
  cashLedger: require("./cash_ledger.schema"),

  credits: require("./credits.schema"),
  // creditPayments: require("./credit_payments.schema"),

  auditLogs: require("./audit_logs.schema"),
  messages: require("./messages.schema"),
  customers: require("./customers.schema"),
};
