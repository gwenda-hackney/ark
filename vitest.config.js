import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "functions/**/*.test.js",
      "scripts/ci/**/*.test.mjs",
      "scripts/lib/**/*.test.mjs",
      "src/**/*.test.ts",
    ],
  },
});
