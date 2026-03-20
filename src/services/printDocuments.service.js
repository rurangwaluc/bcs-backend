"use strict";

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value, currency = "RWF") {
  const amount = Number(value || 0);
  return `${String(currency || "RWF").toUpperCase()} ${amount.toLocaleString()}`;
}

function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function branchBlock(branch = {}) {
  const logo = branch.locationLogoUrl
    ? `<img src="${esc(branch.locationLogoUrl)}" alt="${esc(branch.locationName || "Branch logo")}" style="max-height:72px;max-width:160px;object-fit:contain;" />`
    : `<div style="font-weight:800;font-size:22px;letter-spacing:.03em;">${esc(branch.locationCode || branch.locationName || "BRANCH")}</div>`;

  const lines = [
    branch.locationName,
    branch.locationCode ? `Code: ${branch.locationCode}` : null,
    branch.locationPhone ? `Phone: ${branch.locationPhone}` : null,
    branch.locationWebsite ? `Website: ${branch.locationWebsite}` : null,
    branch.locationEmail ? `Email: ${branch.locationEmail}` : null,
    branch.locationAddress ? `Address: ${branch.locationAddress}` : null,
    branch.locationTin ? `TIN: ${branch.locationTin}` : null,
  ].filter(Boolean);

  return `
    <div class="branch-head">
      <div class="branch-logo">${logo}</div>
      <div class="branch-meta">
        ${lines.map((line) => `<div>${esc(line)}</div>`).join("")}
      </div>
    </div>
  `;
}

function documentShell({ title, subtitle, body, branch }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #111827;
      background: #f5f5f5;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: white;
      padding: 18mm 16mm;
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      border-bottom: 2px solid #111827;
      padding-bottom: 12px;
      margin-bottom: 18px;
      align-items: flex-start;
    }
    .title {
      font-size: 28px;
      font-weight: 800;
      margin: 0;
      letter-spacing: 0.04em;
    }
    .subtitle {
      margin-top: 6px;
      color: #4b5563;
      font-size: 13px;
    }
    .branch-head {
      text-align: right;
      max-width: 360px;
    }
    .branch-logo {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
    }
    .branch-meta {
      font-size: 12px;
      line-height: 1.6;
      color: #374151;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .card {
      border: 1px solid #d1d5db;
      border-radius: 10px;
      padding: 12px;
    }
    .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6b7280;
      margin-bottom: 6px;
    }
    .value {
      font-size: 14px;
      font-weight: 700;
      white-space: pre-wrap;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    th {
      background: #f3f4f6;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .right { text-align: right; }
    .totals {
      margin-top: 18px;
      margin-left: auto;
      width: 320px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 14px;
    }
    .totals-row.final {
      font-size: 18px;
      font-weight: 800;
      border-bottom: 2px solid #111827;
    }
    .footer {
      margin-top: 36px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
    }
    .sign {
      padding-top: 36px;
      border-top: 1px solid #9ca3af;
      color: #374151;
      font-size: 13px;
    }
    .note {
      margin-top: 18px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    @media print {
      body { background: white; }
      .page {
        margin: 0;
        width: auto;
        min-height: auto;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div>
        <h1 class="title">${esc(title)}</h1>
        <div class="subtitle">${esc(subtitle || "")}</div>
      </div>
      ${branchBlock(branch)}
    </div>
    ${body}
  </div>
</body>
</html>`;
}

function renderProformaHtml({ header, items }) {
  const body = `
    <div class="card-grid">
      <div class="card">
        <div class="label">Proforma No</div>
        <div class="value">${esc(header.proformaNo || `#${header.id}`)}</div>
      </div>
      <div class="card">
        <div class="label">Date</div>
        <div class="value">${esc(fmtDate(header.createdAt))}</div>
      </div>
      <div class="card">
        <div class="label">Customer</div>
        <div class="value">${esc(header.customerName || "-")}</div>
      </div>
      <div class="card">
        <div class="label">Phone</div>
        <div class="value">${esc(header.customerPhone || "-")}</div>
      </div>
      <div class="card">
        <div class="label">TIN</div>
        <div class="value">${esc(header.customerTin || "-")}</div>
      </div>
      <div class="card">
        <div class="label">Valid Until</div>
        <div class="value">${esc(header.validUntil || "-")}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:50px;">#</th>
          <th>Item</th>
          <th>SKU</th>
          <th>Unit</th>
          <th class="right">Qty</th>
          <th class="right">Unit Price</th>
          <th class="right">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (row, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${esc(row.productDisplayName || row.productName || "-")}</td>
            <td>${esc(row.productSku || "-")}</td>
            <td>${esc(row.stockUnit || "-")}</td>
            <td class="right">${esc(row.qty)}</td>
            <td class="right">${esc(money(row.unitPrice, header.currency))}</td>
            <td class="right">${esc(money(row.lineTotal, header.currency))}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${esc(money(header.subtotal, header.currency))}</span>
      </div>
      <div class="totals-row final">
        <span>Total</span>
        <span>${esc(money(header.totalAmount, header.currency))}</span>
      </div>
    </div>

    ${
      header.customerAddress
        ? `<div class="note"><strong>Customer Address</strong><br/>${esc(header.customerAddress)}</div>`
        : ""
    }

    ${
      header.note
        ? `<div class="note"><strong>Note</strong><br/>${esc(header.note)}</div>`
        : ""
    }

    ${
      header.terms
        ? `<div class="note"><strong>Terms</strong><br/>${esc(header.terms)}</div>`
        : ""
    }
  `;

  return documentShell({
    title: "PROFORMA INVOICE",
    subtitle: "Quotation / pre-invoice document",
    body,
    branch: header,
  });
}

function renderDeliveryNoteHtml({ header, items }) {
  const body = `
    <div class="card-grid">
      <div class="card">
        <div class="label">Delivery Note No</div>
        <div class="value">${esc(header.deliveryNoteNo || `#${header.id}`)}</div>
      </div>
      <div class="card">
        <div class="label">Sale</div>
        <div class="value">#${esc(header.saleId || "-")}</div>
      </div>
      <div class="card">
        <div class="label">Customer</div>
        <div class="value">${esc(header.customerName || "-")}</div>
      </div>
      <div class="card">
        <div class="label">Phone</div>
        <div class="value">${esc(header.customerPhone || "-")}</div>
      </div>
      <div class="card">
        <div class="label">Delivered To</div>
        <div class="value">${esc(header.deliveredTo || "-")}</div>
      </div>
      <div class="card">
        <div class="label">Delivered Phone</div>
        <div class="value">${esc(header.deliveredPhone || "-")}</div>
      </div>
      <div class="card">
        <div class="label">Dispatched At</div>
        <div class="value">${esc(fmtDate(header.dispatchedAt || header.createdAt))}</div>
      </div>
      <div class="card">
        <div class="label">Delivered At</div>
        <div class="value">${esc(fmtDate(header.deliveredAt))}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:50px;">#</th>
          <th>Item</th>
          <th>SKU</th>
          <th>Unit</th>
          <th class="right">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (row, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${esc(row.productDisplayName || row.productName || "-")}</td>
            <td>${esc(row.productSku || "-")}</td>
            <td>${esc(row.stockUnit || "-")}</td>
            <td class="right">${esc(row.qty)}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Total item lines</span>
        <span>${esc(header.totalItems)}</span>
      </div>
      <div class="totals-row final">
        <span>Total qty</span>
        <span>${esc(header.totalQty)}</span>
      </div>
    </div>

    ${
      header.customerAddress
        ? `<div class="note"><strong>Customer Address</strong><br/>${esc(header.customerAddress)}</div>`
        : ""
    }

    ${
      header.note
        ? `<div class="note"><strong>Note</strong><br/>${esc(header.note)}</div>`
        : ""
    }

    <div class="footer">
      <div class="sign">Prepared by</div>
      <div class="sign">Received by</div>
    </div>
  `;

  return documentShell({
    title: "DELIVERY NOTE",
    subtitle: "Goods dispatch / handover document",
    body,
    branch: header,
  });
}

module.exports = {
  renderProformaHtml,
  renderDeliveryNoteHtml,
};
