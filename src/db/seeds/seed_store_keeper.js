const { db } = require("../../config/db");
const { users } = require("../schema/users.schema");
const { hashPassword } = require("../../utils/password");

async function seedStoreKeeper() {
  const passwordHash = hashPassword("Store@12345");

  await db.insert(users).values({
    locationId: 1,
    name: "Store Keeper One",
    email: "storekeeper@bcs.local",
    passwordHash,
    role: "store_keeper",
    isActive: true,
  });

  console.log("✅ Seeded store keeper: storekeeper@bcs.local / Store@12345");
  process.exit(0);
}

seedStoreKeeper().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
