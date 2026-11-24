import { MetricsBatcher } from "../../src/metrics/batcher";

describe("MetricsBatcher", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("sends counters once per interval", async () => {
    const send = jest.fn(async () => {});
    const batcher = new MetricsBatcher({ flushIntervalMs: 1000, sink: { send }, prefix: "t." });
    batcher.increment("a");
    batcher.increment("a");
    batcher.increment("b", 5);
    await jest.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledWith(["t.a:2|c", "t.b:5|c"]);
    await batcher.stop();
  });

  it("does not send empty batches", async () => {
    const send = jest.fn(async () => {});
    const batcher = new MetricsBatcher({ flushIntervalMs: 1000, sink: { send } });
    await jest.advanceTimersByTimeAsync(3000);
    expect(send).not.toHaveBeenCalled();
    await batcher.stop();
  });

  it("flushes on stop", async () => {
    const send = jest.fn(async () => {});
    const batcher = new MetricsBatcher({ flushIntervalMs: 1000, sink: { send } });
    batcher.increment("c");
    await batcher.stop();
    expect(send).toHaveBeenCalledWith(["c:1|c"]);
  });
});
