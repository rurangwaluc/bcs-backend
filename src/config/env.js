// backend/src/config/env.js
const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    SESSION_SECRET: z
      .string()
      .min(10, "SESSION_SECRET must be at least 10 chars"),
    CORS_ORIGIN: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    // In production, do not allow open CORS by default.
    if (val.NODE_ENV === "production") {
      if (!val.CORS_ORIGIN || !val.CORS_ORIGIN.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGIN"],
          message:
            "CORS_ORIGIN is required in production (comma-separated list of allowed origins)",
        });
      }
      if (val.CORS_ORIGIN && val.CORS_ORIGIN.trim() === "*") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGIN"],
          message: "CORS_ORIGIN must not be '*' in production",
        });
      }
    }
  });

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

module.exports = {
  env: parsed.data,
};
