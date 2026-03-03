// backend/src/controllers/cashReconcileController.js

const { createCashReconcileSchema } = require("../validators/cashReconcile.schema");
const cashReconcileService = require("../services/cashReconcileService");

function pickInt(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function extractErrMessage(e) {
  if (!e) return "";
  return String(
    e.message ||
      e.err?.message ||
      e.cause?.message ||
      e.originalError?.message ||
      ""
  );
}

function isSessionNotClosedError(e) {
  const msg = extractErrMessage(e);
  return msg.includes("must be CLOSED before reconciliation");
}

async function createCashReconcile(request, reply) {
  const parsed = createCashReconcileSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const cashierId = pickInt(
    request.user?.id,
    request.user?.userId,
    request.user?.user_id,
    request.user?.uid
  );

  const locationId = pickInt(
    request.user?.locationId,
    request.user?.location_id,
    request.user?.locId
  );

  if (!cashierId || !locationId) {
    request.log.error({ user: request.user }, "Missing user id or location id on request.user");
    return reply.status(401).send({ error: "Not authenticated" });
  }

  try {
    const out = await cashReconcileService.createReconcile({
      locationId,
      cashierId,
      cashSessionId: parsed.data.cashSessionId,
      countedCash: parsed.data.countedCash,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, reconcile: out });
  } catch (e) {
    // DB trigger: session must be closed
    if (isSessionNotClosedError(e)) {
      return reply.status(409).send({
        error: "Cash session must be CLOSED before reconciliation",
      });
    }

    // clean service codes
    if (e.code === "SESSION_NOT_FOUND") return reply.status(404).send({ error: e.message });

    if (e.code === "BAD_CASHIER" || e.code === "BAD_LOCATION" || e.code === "BAD_SESSION") {
      return reply.status(400).send({ error: e.message });
    }

    if (e.code === "BAD_AMOUNT") return reply.status(400).send({ error: e.message });

    if (e.code === "NOT_YOUR_SESSION") return reply.status(403).send({ error: e.message });

    request.log.error({ err: e, msg: extractErrMessage(e) }, "createCashReconcile failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listCashReconciles(request, reply) {
  const locationId = pickInt(request.user?.locationId, request.user?.location_id, request.user?.locId);
  if (!locationId) return reply.status(401).send({ error: "Not authenticated" });

  try {
    const rows = await cashReconcileService.listReconciles({ locationId });
    return reply.send({ ok: true, reconciles: rows });
  } catch (e) {
    request.log.error({ err: e }, "listCashReconciles failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { createCashReconcile, listCashReconciles };