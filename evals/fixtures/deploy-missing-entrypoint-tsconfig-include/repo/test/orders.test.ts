import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("defaults the port", () => {
    expect(loadConfig({ DATABASE_URL: "postgres://x@localhost/db" }).port).toBe(8080);
  });
});
