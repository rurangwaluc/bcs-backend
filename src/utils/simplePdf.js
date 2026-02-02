// Very small PDF generator for simple text reports.
// No external deps. Produces a single-page PDF with fixed-width text.
function escapePdfText(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildSimplePdf(lines, { title } = {}) {
  const contentLines = [];
  const fontSize = 11;
  const left = 50;
  let y = 770;

  if (title) {
    contentLines.push(
      `BT /F1 16 Tf ${left} ${y} Td (${escapePdfText(title)}) Tj ET`,
    );
    y -= 28;
  }

  for (const line of lines) {
    if (y < 60) break; // single page only
    contentLines.push(
      `BT /F1 ${fontSize} Tf ${left} ${y} Td (${escapePdfText(line)}) Tj ET`,
    );
    y -= 16;
  }

  const stream = contentLines.join("\n");
  const objects = [];

  // 1) Catalog
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  // 2) Pages
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  // 3) Page
  objects.push(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
  );
  // 4) Font
  objects.push(
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj",
  );
  // 5) Content stream
  objects.push(
    `5 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`,
  );

  // Build xref
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj + "\n";
  }
  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += "xref\n";
  pdf += `0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    const off = String(offsets[i]).padStart(10, "0");
    pdf += `${off} 00000 n \n`;
  }
  pdf += "trailer\n";
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += "startxref\n";
  pdf += `${xrefPos}\n`;
  pdf += "%%EOF\n";

  return Buffer.from(pdf, "utf8");
}

module.exports = { buildSimplePdf };
