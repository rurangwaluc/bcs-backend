const { db } = require("../../config/db");
const { users } = require("../schema/users.schema");
const { hashPassword } = require("../../utils/password");

async function seedManager() {
  const passwordHash = hashPassword("Manager@12345");

  await db.insert(users).values({
    locationId: 1,
    name: "Manager One",
    email: "manager@bcs.local",
    passwordHash,
    role: "manager",
    isActive: true
  });

  console.log("✅ Seeded manager user: manager@bcs.local / Manager@12345");
  process.exit(0);
}

seedManager().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
