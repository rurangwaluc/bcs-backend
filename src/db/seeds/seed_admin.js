const { db } = require("../../config/db");
const { users } = require("../schema/users.schema");
const { hashPassword } = require("../../utils/password");

async function seedAdmin() {
  const passwordHash = hashPassword("Admin@12345");

  await db.insert(users).values({
    locationId: 1,
    name: "Owner Admin",
    email: "admin@bcs.local",
    passwordHash,
    role: "admin",
    isActive: true
  });

  console.log("✅ Seeded admin user: admin@bcs.local / Admin@12345");
  process.exit(0);
}

seedAdmin().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
