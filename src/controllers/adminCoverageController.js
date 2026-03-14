const { z } = require("zod");
const {
  ALLOWED_COVERAGE_ROLES,
  ALLOWED_COVERAGE_REASONS,
  getCoverageBySessionId,
  startCoverage,
  stopCoverage,
} = require("../services/coverageService");
const { safeLogAudit } = require("../services/auditService");

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function ensureCoverageManager(request, reply) {
  if (!request.user?.id || !request.session?.id) {
    reply.status(401).send({ error: "Unauthorized" });
    return false;
  }

  const role = normalizeRole(request.user.role);
  if (role !== "admin" && role !== "owner") {
    reply.status(403).send({
      error: "Forbidden",
      debug: { role, required: "admin_or_owner" },
    });
    return false;
  }

  return true;
}

const startCoverageSchema = z.object({
  actingAsRole: z.enum(ALLOWED_COVERAGE_ROLES),
  reason: z.enum(ALLOWED_COVERAGE_REASONS),
  note: z.string().max(500).optional().or(z.literal("")),
});

async function getCurrentCoverage(request, reply) {
  if (!ensureCoverageManager(request, reply)) return;

  try {
    const coverage = await getCoverageBySessionId(request.session.id);
    return reply.send({ ok: true, coverage });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "Failed to load coverage mode",
      debug: e?.message || String(e),
    });
  }
}

async function startCoverageMode(request, reply) {
  if (!ensureCoverageManager(request, reply)) return;

  const parsed = startCoverageSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid coverage payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const coverage = await startCoverage({
      sessionId: request.session.id,
      actingAsRole: parsed.data.actingAsRole,
      reason: parsed.data.reason,
      note: parsed.data.note || null,
    });

    await safeLogAudit({
      locationId: request.user.locationId ?? null,
      userId: request.user.id ?? null,
      action: "ADMIN_COVERAGE_START",
      entity: "session",
      entityId: request.session.id,
      description: `Coverage mode started as ${coverage?.actingAsRole}`,
      meta: {
        actingAsRole: coverage?.actingAsRole ?? null,
        coverageReason: coverage?.reason ?? null,
        coverageNote: coverage?.note ?? null,
        coverageStartedAt: coverage?.startedAt ?? null,
      },
    });

    return reply.send({ ok: true, coverage });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "Failed to start coverage mode",
      debug: e?.code || e?.message || String(e),
    });
  }
}

async function stopCoverageMode(request, reply) {
  if (!ensureCoverageManager(request, reply)) return;

  try {
    const before = await getCoverageBySessionId(request.session.id);
    const coverage = await stopCoverage({ sessionId: request.session.id });

    await safeLogAudit({
      locationId: request.user.locationId ?? null,
      userId: request.user.id ?? null,
      action: "ADMIN_COVERAGE_STOP",
      entity: "session",
      entityId: request.session.id,
      description: `Coverage mode stopped`,
      meta: {
        previousActingAsRole: before?.actingAsRole ?? null,
        previousCoverageReason: before?.reason ?? null,
        previousCoverageNote: before?.note ?? null,
        previousCoverageStartedAt: before?.startedAt ?? null,
      },
    });

    return reply.send({ ok: true, coverage });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "Failed to stop coverage mode",
      debug: e?.code || e?.message || String(e),
    });
  }
}

module.exports = {
  getCurrentCoverage,
  startCoverageMode,
  stopCoverageMode,
};
