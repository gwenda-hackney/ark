/**
 * Guardrail: every Pages Function dependency must resolve (inside web/functions
 * or the repo-level shared/ folder). Catches broken imports before deploy.
 */
import { describe, expect, it } from "vitest";

const modules = [
  "../api/subscribe.js",
  "../api/forms/index.js",
  "../api/forms/verify.js",
  "../api/forms/resend.js",
  "../api/forms/admin/resend.js",
  "../health.js",
  "../api/events.js",
  "../api/whats-on.js",
  "../api/whats-on/schedule.js",
  "../api/whats-on/[series].js",
  "../whats-on/[[path]].js",
  "../api/auth.js",
  "./event-series.js",
  "./form-submit.js",
];

describe("Pages Function imports", () => {
  for (const specifier of modules) {
    it(`loads ${specifier}`, async () => {
      await expect(import(specifier)).resolves.toBeDefined();
    });
  }
});
