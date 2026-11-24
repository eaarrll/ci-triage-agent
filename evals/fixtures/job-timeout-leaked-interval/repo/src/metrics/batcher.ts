export interface MetricsSink {
  send(lines: string[]): Promise<void>;
}

export interface BatcherOptions {
  flushIntervalMs: number;
  sink: MetricsSink;
  prefix?: string;
}

/**
 * Buffers counters in memory and sends them in one batch per interval, instead of one UDP packet per
 * event. At peak we handle ~4k events/s, which was saturating the StatsD agent.
 */
export class MetricsBatcher {
  private readonly counters = new Map<string, number>();
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly opts: BatcherOptions) {
    this.timer = setInterval(() => void this.flush(), opts.flushIntervalMs);
  }

  increment(name: string, by = 1): void {
    const key = `${this.opts.prefix ?? ""}${name}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  async flush(): Promise<void> {
    if (this.counters.size === 0) return;
    const lines = [...this.counters].map(([key, value]) => `${key}:${value}|c`);
    this.counters.clear();
    await this.opts.sink.send(lines);
  }

  /** Sends what is buffered and stops the timer. Call on shutdown. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }
}
