import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    hookTimeout: 180_000,
    testTimeout: 30_000,
    env: { TZ: "UTC" },
  },
});
