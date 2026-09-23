/**
 * Guardrail: every Pages Function dependency must resolve inside web/functions.
 * Catches broken cross-repo imports before deploy.
 */
import { describe, expect, it } from "vitest";

const modules = [
  "../api/rsvp.js",
  "../api/subscribe.js",
  "../api/forms/index.js",
  "../api/forms/verify.js",
  "../api/forms/resend.js",
  "../health.js",
  "../api/events.js",
  "../api/whats-on.js",
  "../api/whats-on/[series].js",
  "../api/auth.js",
  "../api/staging-share.js",
  "./event-password.js",
  "./event-series.js",
  "./rsvp.js",
  "./sanity-event.js",
  "./form-submit.js",
];

describe("Pages Function imports", () => {
  for (const specifier of modules) {
    it(`loads ${specifier}`, async () => {
      await expect(import(specifier)).resolves.toBeDefined();
    });
  }
});
