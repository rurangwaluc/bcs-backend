const express = require("express");
const AdminJS = require("@adminjs/core");
const AdminJSExpress = require("@adminjs/express");
const { Pool } = require("pg");

// DB connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Simple resource config (raw tables)
const adminJs = new AdminJS({
  rootPath: "/admin",
  resources: [
    {
      resource: { tableName: "users", pool },
      options: {
        listProperties: [
          "id",
          "name",
          "email",
          "role",
          "isActive",
          "created_at",
        ],
      },
    },
    {
      resource: { tableName: "audit_logs", pool },
      options: {
        listProperties: [
          "id",
          "location_id",
          "user_id",
          "action",
          "entity",
          "entity_id",
          "description",
          "meta",
          "created_at",
        ],
      },
    },
  ],
});

const router = AdminJSExpress.buildRouter(adminJs);

const app = express();
app.use(adminJs.options.rootPath, router);

app.listen(3000, () => {
  console.log("AdminJS running at http://localhost:3000/admin");
});
