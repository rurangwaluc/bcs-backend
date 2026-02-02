const { z } = require("zod");
const messageService = require("../services/messagingService");

const ENTITY_TYPES = ["stock_request", "sale", "inventory"];

const createMessageSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.number().int().positive(),
  message: z.string().min(1).max(2000),
});

const getMessagesParamsSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.coerce.number().int().positive(),
});

const getMessagesQuerySchema = z.object({
  // owner can optionally target a location; others are forced to their own location
  locationId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

async function createMessage(request, reply) {
  const parsed = createMessageSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  // Only owner may post without a locationId (but in your staff app, everyone has one)
  const locationId = request.user?.locationId;
  if (!locationId) {
    return reply.status(400).send({ error: "Missing user location" });
  }

  await messageService.postMessage({
    locationId,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    user: {
      id: request.user.id,
      role: request.user.role,
      message: parsed.data.message,
    },
  });

  return reply.send({ ok: true });
}

async function getMessages(request, reply) {
  if (!request.user) return reply.status(401).send({ error: "Unauthorized" });

  const p = getMessagesParamsSchema.safeParse(request.params);
  if (!p.success) {
    return reply
      .status(400)
      .send({ error: "Invalid params", details: p.error.flatten() });
  }

  const q = getMessagesQuerySchema.safeParse(request.query);
  if (!q.success) {
    return reply
      .status(400)
      .send({ error: "Invalid query", details: q.error.flatten() });
  }

  const isOwner = String(request.user.role || "").toLowerCase() === "owner";

  // Location scoping:
  // - Non-owner: forced to own locationId
  // - Owner: can pass locationId, or omit to see across locations (future multi-location)
  const effectiveLocationId = isOwner
    ? (q.data.locationId ?? null)
    : request.user.locationId;

  const rows = await messageService.listMessages({
    locationId: effectiveLocationId,
    entityType: p.data.entityType,
    entityId: p.data.entityId,
    limit: q.data.limit ?? 200,
  });

  return reply.send({ ok: true, messages: rows });
}

module.exports = { createMessage, getMessages };
