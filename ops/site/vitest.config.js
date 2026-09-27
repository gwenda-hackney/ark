import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ops",
    include: ["functions/**/*.test.js", "scripts/**/*.test.{js,mjs}", "menu-app/src/**/*.test.ts"],
  },
});
