const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  createUser,
  listUsers,
  updateUser,
  deleteUser,
} = require("../controllers/usersController");

async function usersRoutes(app) {
  // Admin can manage users
  app.post(
    "/users",
    { preHandler: [requirePermission(ACTIONS.USER_MANAGE)] },
    createUser,
  );

  app.get(
    "/users",
    { preHandler: [requirePermission(ACTIONS.USER_VIEW)] },
    listUsers,
  );

  // Update (PATCH)
  app.patch(
    "/users/:id",
    { preHandler: [requirePermission(ACTIONS.USER_MANAGE)] },
    updateUser,
  );

  // "Delete" = deactivate (real world)
  app.delete(
    "/users/:id",
    { preHandler: [requirePermission(ACTIONS.USER_MANAGE)] },
    deleteUser,
  );
}

module.exports = { usersRoutes };
