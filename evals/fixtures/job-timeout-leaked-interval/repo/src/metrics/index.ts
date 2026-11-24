import { MetricsBatcher } from "./batcher";
import { statsdSink } from "./statsd";

/** Process-wide counters, flushed every 10 seconds. */
export const metrics = new MetricsBatcher({
  flushIntervalMs: 10_000,
  sink: statsdSink(process.env.STATSD_HOST ?? "127.0.0.1", Number(process.env.STATSD_PORT ?? 8125)),
  prefix: "events_worker.",
});
