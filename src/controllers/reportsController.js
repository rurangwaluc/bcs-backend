// backend/src/controllers/reportsController.js
const PDFDocument = require("pdfkit");
const reportsService = require("../services/reportsService");

/**
 * ✅ FIX: Use LOCAL day boundaries for "from/to" inputs.
 * Date inputs mean local days. Using UTC can hide data.
 */
function parseDateOnly(s) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;

  const [yy, mm, dd] = v.split("-").map(Number);
  const d = new Date(yy, mm - 1, dd, 0, 0, 0, 0); // local midnight
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function getRangeFromQuery(query) {
  const now = new Date();

  const defaultFrom = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );

  // "to" is inclusive in UI, but we convert to exclusive end (to + 1 day)
  const defaultTo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );

  const fromDate = parseDateOnly(query?.from);
  const toDate = parseDateOnly(query?.to);

  const start = fromDate ? new Date(fromDate) : defaultFrom;

  const toBase = toDate ? new Date(toDate) : defaultTo;
  const end = new Date(toBase);
  end.setDate(end.getDate() + 1); // exclusive end

  return { start, end };
}

// --------------------------------------------------
// Existing PDF Reports
// --------------------------------------------------

async function dailyReport(request, reply) {
  const locationId = request.user.locationId;
  const date = request.query?.date || new Date().toISOString().slice(0, 10);

  const range = reportsService.dayRange(date);
  if (!range)
    return reply.status(400).send({ error: "Invalid date. Use YYYY-MM-DD" });

  const summary = await reportsService.salesAndPaymentsSummary({
    locationId,
    start: range.start,
    end: range.end,
  });

  const inv = await reportsService.inventorySnapshot({ locationId, limit: 50 });
  const holdings = await reportsService.sellerHoldingsSnapshot({
    locationId,
    limit: 100,
  });

  const doc = new PDFDocument({ margin: 40 });
  reply.header("Content-Type", "application/pdf");
  reply.header(
    "Content-Disposition",
    `attachment; filename="daily-report-${date}.pdf"`
  );

  doc.pipe(reply.raw);

  doc.fontSize(18).text("Daily Report", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Date: ${date}`);
  doc.text(`Location ID: ${locationId}`);
  doc.moveDown();

  doc.fontSize(14).text("Sales & Payments Summary", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Sales count: ${summary.salesCount}`);
  doc.text(`Sales total: ${summary.salesTotal}`);
  doc.text(`Payments count: ${summary.paymentsCount}`);
  doc.text(`Payments total: ${summary.paymentsTotal}`);
  doc.moveDown();

  doc.fontSize(14).text("Inventory Snapshot (top 50)", { underline: true });
  doc.moveDown(0.5);
  inv.forEach((r) => {
    doc
      .fontSize(10)
      .text(
        `#${r.id} ${r.name} (${r.sku || "-"}) qty=${r.qtyOnHand} cost=${r.costPrice || 0} sell=${r.sellingPrice || 0}`
      );
  });

  doc.moveDown();
  doc
    .fontSize(14)
    .text("Seller Holdings Snapshot (top 100)", { underline: true });
  doc.moveDown(0.5);
  holdings.forEach((r) => {
    doc
      .fontSize(10)
      .text(
        `seller=${r.sellerId} product=${r.productId} ${r.productName} qty=${r.qtyOnHand}`
      );
  });

  doc.end();
}

async function weeklyReport(request, reply) {
  const locationId = request.user.locationId;
  const startStr = request.query?.start || new Date().toISOString().slice(0, 10);

  const range = reportsService.weekRange(startStr);
  if (!range)
    return reply.status(400).send({ error: "Invalid start. Use YYYY-MM-DD" });

  const summary = await reportsService.salesAndPaymentsSummary({
    locationId,
    start: range.start,
    end: range.end,
  });

  const doc = new PDFDocument({ margin: 40 });
  reply.header("Content-Type", "application/pdf");
  reply.header(
    "Content-Disposition",
    `attachment; filename="weekly-report-${startStr}.pdf"`
  );

  doc.pipe(reply.raw);

  doc.fontSize(18).text("Weekly Report", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Start: ${startStr}`);
  doc.text(`Location ID: ${locationId}`);
  doc.moveDown();

  doc.fontSize(14).text("Sales & Payments Summary", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Sales count: ${summary.salesCount}`);
  doc.text(`Sales total: ${summary.salesTotal}`);
  doc.text(`Payments count: ${summary.paymentsCount}`);
  doc.text(`Payments total: ${summary.paymentsTotal}`);

  doc.end();
}

async function monthlyReport(request, reply) {
  const locationId = request.user.locationId;
  const month = request.query?.month || new Date().toISOString().slice(0, 7);

  const range = reportsService.monthRange(month);
  if (!range)
    return reply.status(400).send({ error: "Invalid month. Use YYYY-MM" });

  const summary = await reportsService.salesAndPaymentsSummary({
    locationId,
    start: range.start,
    end: range.end,
  });

  const doc = new PDFDocument({ margin: 40 });
  reply.header("Content-Type", "application/pdf");
  reply.header(
    "Content-Disposition",
    `attachment; filename="monthly-report-${month}.pdf"`
  );

  doc.pipe(reply.raw);

  doc.fontSize(18).text("Monthly Report", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Month: ${month}`);
  doc.text(`Location ID: ${locationId}`);
  doc.moveDown();

  doc.fontSize(14).text("Sales & Payments Summary", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Sales count: ${summary.salesCount}`);
  doc.text(`Sales total: ${summary.salesTotal}`);
  doc.text(`Payments count: ${summary.paymentsCount}`);
  doc.text(`Payments total: ${summary.paymentsTotal}`);

  doc.end();
}

// --------------------------------------------------
// ✅ Cash Reports (JSON for dashboards)
// --------------------------------------------------

async function cashSummaryReport(request, reply) {
  try {
    const locationId = request.user.locationId;
    const { start, end } = getRangeFromQuery(request.query);

    const summary = await reportsService.cashSummary({ locationId, start, end });
    return reply.send({ ok: true, range: { start, end }, summary });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function cashSessionsReport(request, reply) {
  try {
    const locationId = request.user.locationId;
    const { start, end } = getRangeFromQuery(request.query);

    const out = await reportsService.cashSessionsReport({ locationId, start, end });
    return reply.send({ ok: true, range: { start, end }, ...out });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function cashLedgerReport(request, reply) {
  try {
    const locationId = request.user.locationId;
    const { start, end } = getRangeFromQuery(request.query);
    const limit = Math.min(500, Math.max(1, Number(request.query?.limit || 200)));

    const rows = await reportsService.cashLedgerReport({ locationId, start, end, limit });
    return reply.send({ ok: true, range: { start, end }, rows });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function cashRefundsReport(request, reply) {
  try {
    const locationId = request.user.locationId;
    const { start, end } = getRangeFromQuery(request.query);
    const limit = Math.min(500, Math.max(1, Number(request.query?.limit || 200)));

    const rows = await reportsService.cashRefundsReport({ locationId, start, end, limit });
    return reply.send({ ok: true, range: { start, end }, rows });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  dailyReport,
  weeklyReport,
  monthlyReport,

  cashSummaryReport,
  cashSessionsReport,
  cashLedgerReport,
  cashRefundsReport,
};