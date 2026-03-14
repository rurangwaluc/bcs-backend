const { db } = require("../config/db");
const { sessions } = require("../db/schema/sessions.schema");
const { eq } = require("drizzle-orm");

const ALLOWED_COVERAGE_ROLES = ["store_keeper", "cashier", "seller", "manager"];

const ALLOWED_COVERAGE_REASONS = [
  "SICK_LEAVE",
  "ABSENT",
  "TRAINING",
  "TEMP_SUPPORT",
  "EMERGENCY",
  "SUSPENDED",
];

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeReason(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function toCoverageDto(sessionRow) {
  const actingAsRole = sessionRow?.actingAsRole ?? null;
  const coverageReason = sessionRow?.coverageReason ?? null;
  const coverageNote = sessionRow?.coverageNote ?? null;
  const coverageStartedAt = sessionRow?.coverageStartedAt ?? null;

  return {
    active: !!actingAsRole,
    actingAsRole,
    reason: coverageReason,
    note: coverageNote,
    startedAt: coverageStartedAt,
  };
}

async function getCoverageBySessionId(sessionId) {
  const rows = await db
    .select({
      id: sessions.id,
      actingAsRole: sessions.actingAsRole,
      coverageReason: sessions.coverageReason,
      coverageNote: sessions.coverageNote,
      coverageStartedAt: sessions.coverageStartedAt,
    })
    .from(sessions)
    .where(eq(sessions.id, Number(sessionId)));

  const row = rows[0];
  if (!row) return null;

  return toCoverageDto(row);
}

async function startCoverage({ sessionId, actingAsRole, reason, note }) {
  const cleanRole = normalizeRole(actingAsRole);
  const cleanReason = normalizeReason(reason);
  const cleanNote = String(note || "").trim() || null;

  if (!ALLOWED_COVERAGE_ROLES.includes(cleanRole)) {
    const err = new Error("Invalid coverage role");
    err.code = "INVALID_COVERAGE_ROLE";
    throw err;
  }

  if (!ALLOWED_COVERAGE_REASONS.includes(cleanReason)) {
    const err = new Error("Invalid coverage reason");
    err.code = "INVALID_COVERAGE_REASON";
    throw err;
  }

  await db
    .update(sessions)
    .set({
      actingAsRole: cleanRole,
      coverageReason: cleanReason,
      coverageNote: cleanNote,
      coverageStartedAt: new Date(),
    })
    .where(eq(sessions.id, Number(sessionId)));

  return getCoverageBySessionId(sessionId);
}

async function stopCoverage({ sessionId }) {
  await db
    .update(sessions)
    .set({
      actingAsRole: null,
      coverageReason: null,
      coverageNote: null,
      coverageStartedAt: null,
    })
    .where(eq(sessions.id, Number(sessionId)));

  return getCoverageBySessionId(sessionId);
}

module.exports = {
  ALLOWED_COVERAGE_ROLES,
  ALLOWED_COVERAGE_REASONS,
  getCoverageBySessionId,
  startCoverage,
  stopCoverage,
};
