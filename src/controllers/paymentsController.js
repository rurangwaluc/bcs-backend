const { recordPaymentSchema } = require("../validators/payments.schema");
const paymentService = require("../services/paymentService");

async function recordPayment(request, reply) {
  const parsed = recordPaymentSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const sale = await paymentService.recordPayment({
      locationId: request.user.locationId,
      cashierId: request.user.id,
      saleId: parsed.data.saleId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      note: parsed.data.note,

      // ✅ PASS SESSION ID
      cashSessionId: parsed.data.cashSessionId,
    });

    return reply.send({ ok: true, sale });
  } catch (e) {
    if (e.code === "NOT_FOUND")
      return reply.status(404).send({ error: "Sale not found" });

    if (e.code === "BAD_STATUS")
      return reply.status(409).send({ error: "Invalid sale status" });

    if (e.code === "BAD_AMOUNT")
      return reply.status(409).send({ error: "Amount must equal sale total" });

    if (e.code === "DUPLICATE_PAYMENT")
      return reply.status(409).send({ error: "Payment already recorded" });

    if (e.code === "NO_OPEN_SESSION")
      return reply.status(409).send({ error: "No open cash session" });

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { recordPayment };
