import { describe, expect, it } from "vitest";
import { pricingConfig, serverConfig } from "../src/config.js";

describe("config", () => {
  it("defaults the volume discount settings", () => {
    expect(pricingConfig.volumeDiscount).toEqual({ threshold: 100, rate: 0.1 });
  });

  it("defaults the port", () => {
    expect(serverConfig.port).toBe(8080);
  });
});
