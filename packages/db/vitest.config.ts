import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Testcontainers needs time to pull and start the Postgres image,
    // especially on a cold CI runner where the layer cache is empty.
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
