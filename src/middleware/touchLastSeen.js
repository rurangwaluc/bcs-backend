const { db } = require("../config/db");
const { users } = require("../db/schema/users.schema");
const { eq } = require("drizzle-orm");

async function touchLastSeen(request, reply) {
  // If not logged in, do nothing.
  const userId = request.user?.id;
  if (!userId) return;

  // Avoid too many DB writes: update only once per minute per process.
  // (Good enough for now)
  const now = Date.now();
  const last = request.user?._lastSeenTouchedAt ?? 0;
  if (now - last < 60_000) return;

  request.user._lastSeenTouchedAt = now;

  try {
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, Number(userId)));
  } catch (e) {
    // Don't break the request if this fails.
    request.log?.warn?.(e, "touchLastSeen failed");
  }
}

module.exports = { touchLastSeen };