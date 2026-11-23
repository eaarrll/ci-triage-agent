import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    reporters: process.env.GITHUB_ACTIONS ? ["verbose", "github-actions"] : ["default"],
  },
});
