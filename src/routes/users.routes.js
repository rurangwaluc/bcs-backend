const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createUser,
  listUsers,
  updateUser,
  deleteUser,
  resetUserPassword,
} = require("../controllers/usersController");

async function usersRoutes(app) {
  app.post(
    "/users",
    { preHandler: [requirePermission(ACTIONS.USER_CREATE)] },
    createUser,
  );

  app.get(
    "/users",
    { preHandler: [requirePermission(ACTIONS.USER_VIEW)] },
    listUsers,
  );

  app.patch(
    "/users/:id",
    { preHandler: [requirePermission(ACTIONS.USER_UPDATE)] },
    updateUser,
  );

  app.post(
    "/users/:id/reset-password",
    { preHandler: [requirePermission(ACTIONS.USER_UPDATE)] },
    resetUserPassword,
  );

  app.delete(
    "/users/:id",
    { preHandler: [requirePermission(ACTIONS.USER_DELETE)] },
    deleteUser,
  );
}

module.exports = { usersRoutes };
