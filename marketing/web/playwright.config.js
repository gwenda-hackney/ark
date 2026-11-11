import { defineConfig } from "@playwright/test";

/**
 * Browser tests (e2e/): the site as a visitor uses it, in Chromium.
 * `npm run test:e2e` runs them.
 *
 * Locally they run against the dev server on 4321, reusing it when it is up
 * and starting it (`npm run dev`) when not. E2E_BASE_URL points them at any
 * other running copy (a build under `npm run preview`, a branch preview), and
 * then nothing is started.
 *
 * The browser is Playwright's headless Chromium, from its usual place
 * (~/.cache/ms-playwright, or PLAYWRIGHT_BROWSERS_PATH): nothing is
 * downloaded when it is already there. Once per machine, or in CI:
 * `npx playwright install chromium-headless-shell`.
 */
const running = process.env.E2E_BASE_URL;
const baseURL = running || "http://localhost:4321";

export default defineConfig({
  testDir: "e2e",
  outputDir: ".e2e/results",
  fullyParallel: true,
  // The tests watch the page move: two at a time, so they don't starve the
  // dev server (or each other) of frames on a machine other work shares
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // The dev server builds a page the first time it is asked for
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: ".e2e/report", open: "never" }],
  ],
  use: {
    baseURL,
    // A desk screen: home's bar shows from 1000px
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: running
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
