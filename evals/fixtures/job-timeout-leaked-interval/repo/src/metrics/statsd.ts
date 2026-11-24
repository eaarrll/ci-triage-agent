import { createSocket } from "node:dgram";
import type { MetricsSink } from "./batcher";

export function statsdSink(host: string, port: number): MetricsSink {
  const socket = createSocket("udp4");
  socket.unref();
  return {
    send: (lines) =>
      new Promise((resolve) => socket.send(lines.join("\n"), port, host, () => resolve())),
  };
}
