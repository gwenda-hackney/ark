import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ops",
    include: ["functions/**/*.test.js", "src/**/*.test.{js,ts}"],
  },
});
