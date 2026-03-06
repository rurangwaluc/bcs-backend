// backend/src/routes/users.routes.js

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createUser,
  listUsers,
  updateUser,
  deleteUser,
} = require("../controllers/usersController");

async function usersRoutes(app) {
  // Create user (Admin/Owner)
  app.post(
    "/users",
    { preHandler: [requirePermission(ACTIONS.USER_CREATE)] },
    createUser,
  );

  // View users
  app.get(
    "/users",
    { preHandler: [requirePermission(ACTIONS.USER_VIEW)] },
    listUsers,
  );

  // Update user (PATCH)
  app.patch(
    "/users/:id",
    { preHandler: [requirePermission(ACTIONS.USER_UPDATE)] },
    updateUser,
  );

  // Deactivate user (real world "delete")
  app.delete(
    "/users/:id",
    { preHandler: [requirePermission(ACTIONS.USER_DELETE)] },
    deleteUser,
  );
}

module.exports = { usersRoutes };
