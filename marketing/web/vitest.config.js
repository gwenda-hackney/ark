import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "functions/**/*.test.js",
      "scripts/ci/**/*.test.mjs",
      "scripts/lib/**/*.test.mjs",
      "src/**/*.test.ts",
      "src/**/*.test.js",
    ],
    // Browser tests run in Playwright (`npm run test:e2e`), never here
    exclude: [...configDefaults.exclude, "e2e/**", ".e2e/**"],
  },
});
