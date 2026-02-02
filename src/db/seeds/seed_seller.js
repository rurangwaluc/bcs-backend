const { db } = require("../../config/db");
const { users } = require("../schema/users.schema");
const { hashPassword } = require("../../utils/password");

async function seedSeller() {
  const passwordHash = hashPassword("Seller@12345");

  await db.insert(users).values({
    locationId: 1,
    name: "Seller One",
    email: "seller@bcs.local",
    passwordHash,
    role: "seller",
    isActive: true
  });

  console.log("✅ Seeded seller: seller@bcs.local / Seller@12345");
  process.exit(0);
}

seedSeller().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
