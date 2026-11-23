import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  VOLUME_DISCOUNT_THRESHOLD: z.coerce.number().nonnegative().default(100),
  VOLUME_DISCOUNT_RATE: z.coerce.number().min(0).max(1).default(0.1),
});

const env = envSchema.parse(process.env);

export const serverConfig = {
  env: env.NODE_ENV,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
} as const;

export const pricingConfig = {
  volumeDiscount: {
    threshold: env.VOLUME_DISCOUNT_THRESHOLD,
    rate: env.VOLUME_DISCOUNT_RATE,
  },
} as const;
