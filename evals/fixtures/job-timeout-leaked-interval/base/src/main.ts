import pino from "pino";
import { startConsumer } from "./consumer";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
const consumer = startConsumer(log);

process.on("SIGTERM", async () => {
  log.info("shutting down");
  await consumer.stop();
  process.exit(0);
});
