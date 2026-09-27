import { defineConfig } from "vitest/config";

// One runner for the whole repo (#63). Each project finds its tests by glob,
// so a new test file runs without editing config. `npx vitest run` runs all;
// `npm test -w <pkg>` runs one package; the VS Code test explorer reads this.
export default defineConfig({
  test: {
    projects: [
      "marketing/web",
      "marketing/site-deploy-webhook",
      "marketing/site-health",
      "marketing/subscribe-mailchimp-sync",
      "marketing/wifi-captive-portal",
      "ops/site",
      "ops/recipe-cost-webhook",
      { test: { name: "shared", root: "shared", include: ["**/*.test.js"] } },
      { test: { name: "scripts", root: "scripts", include: ["**/*.test.mjs"] } },
    ],
  },
});
