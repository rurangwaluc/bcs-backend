const {
  createUserSchema,
  updateUserSchema,
  resetUserPasswordSchema,
} = require("../validators/users.schema");
const userService = require("../services/userService");

async function createUser(request, reply) {
  const parsed = createUserSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const user = await userService.createUser({
      adminUser: request.user,
      data: parsed.data,
    });
    return reply.send({ ok: true, user });
  } catch (e) {
    if (e.code === "DUPLICATE_EMAIL") {
      return reply
        .status(409)
        .send({ error: "Email already exists in this branch" });
    }
    if (e.code === "OWNER_ONLY") {
      return reply
        .status(403)
        .send({ error: "Only owner can create owner users" });
    }
    if (e.code === "LOCATION_REQUIRED") {
      return reply.status(400).send({ error: "Owner must choose a branch" });
    }
    if (e.code === "INVALID_LOCATION") {
      return reply.status(400).send({ error: "Invalid location id" });
    }
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Location not found" });
    }
    if (e.code === "LOCATION_NOT_ACTIVE") {
      return reply
        .status(409)
        .send({ error: "Users can only be assigned to an active branch" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listUsers(request, reply) {
  const rows = await userService.listUsers({ adminUser: request.user });
  return reply.send({ ok: true, users: rows });
}

async function updateUser(request, reply) {
  const userId = Number(request.params.id);
  if (!userId) return reply.status(400).send({ error: "Invalid user id" });

  const parsed = updateUserSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const user = await userService.updateUser({
      adminUser: request.user,
      targetUserId: userId,
      data: parsed.data,
    });
    return reply.send({ ok: true, user });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "User not found" });
    }
    if (e.code === "CANNOT_DEACTIVATE_SELF") {
      return reply.status(409).send({ error: "Cannot deactivate self" });
    }
    if (e.code === "OWNER_ONLY") {
      return reply
        .status(403)
        .send({ error: "Only owner can modify owner users" });
    }
    if (e.code === "INVALID_LOCATION") {
      return reply.status(400).send({ error: "Invalid location id" });
    }
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Location not found" });
    }
    if (e.code === "LOCATION_NOT_ACTIVE") {
      return reply
        .status(409)
        .send({ error: "Users can only be moved to an active branch" });
    }
    if (e.code === "LOCATION_CHANGE_FORBIDDEN") {
      return reply
        .status(403)
        .send({ error: "Only owner can move users across branches" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function resetUserPassword(request, reply) {
  const userId = Number(request.params.id);
  if (!userId) return reply.status(400).send({ error: "Invalid user id" });

  const parsed = resetUserPasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    await userService.resetUserPassword({
      adminUser: request.user,
      targetUserId: userId,
      password: parsed.data.password,
    });

    return reply.send({ ok: true });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "User not found" });
    }
    if (e.code === "OWNER_ONLY") {
      return reply
        .status(403)
        .send({ error: "Only owner can reset owner passwords" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function deleteUser(request, reply) {
  const userId = Number(request.params.id);
  if (!userId) {
    return reply.status(400).send({ error: "Invalid user id" });
  }

  try {
    const user = await userService.deactivateUser({
      adminUser: request.user,
      targetUserId: userId,
    });

    return reply.send({ ok: true, user });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "User not found" });
    }

    if (e.code === "CANNOT_DEACTIVATE_SELF") {
      return reply.status(409).send({ error: "Cannot deactivate self" });
    }

    if (e.code === "OWNER_ONLY") {
      return reply
        .status(403)
        .send({ error: "Only owner can deactivate owner users" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createUser,
  listUsers,
  updateUser,
  resetUserPassword,
  deleteUser,
};
