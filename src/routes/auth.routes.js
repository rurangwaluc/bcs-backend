const { login, logout, me } = require("../controllers/authController");

async function authRoutes(app) {
  // LOGIN — rate limited
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60 * 1000

        }
      }
    },
    login
  );

  app.post("/auth/logout", logout);
  app.get("/auth/me", me);
}

module.exports = { authRoutes };
