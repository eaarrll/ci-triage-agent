import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: { provider: "v8", include: ["src/**"], reporter: ["text", "lcov"] },
    projects: [
      { test: { name: "unit", include: ["test/unit/**/*.test.ts"] } },
      {
        test: {
          name: "integration",
          include: ["test/integration/**/*.int.test.ts"],
          testTimeout: 15_000,
        },
      },
    ],
  },
});
