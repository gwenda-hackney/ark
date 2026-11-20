import { defineConfig } from "@playwright/test";

/**
 * Ops' browser tests (e2e/): pages as the people running Gwenda use them, in
 * Chromium. `npm run test:e2e -w @gwenda/ops` runs them; CI runs them on
 * every PR (pr.yml, the ops job).
 *
 * Ops' own Vite dev server serves the app on its own port (5179, so it never
 * meets the usual 5174); the tests answer the app's /api calls themselves
 * (e2e/fake-api.ts), so no Functions, database or secrets are needed. Only
 * the browser is real.
 *
 * The browser is Playwright's headless Chromium, from its usual place
 * (~/.cache/ms-playwright): once per machine, or in CI,
 * `npx playwright install chromium-headless-shell`.
 */
const port = Number(process.env.OPS_E2E_PORT) || 5179;

export default defineConfig({
  testDir: "e2e",
  outputDir: ".e2e/results",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    env: { OPS_DEV_PORT: String(port) },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
