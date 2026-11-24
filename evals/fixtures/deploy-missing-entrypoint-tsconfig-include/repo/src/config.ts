import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().url(),
  SKIP_DB_CHECK: z.stringbool().default(false),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env = process.env) {
  const parsed = schema.parse(env);
  return {
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    skipDbCheck: parsed.SKIP_DB_CHECK,
  };
}
