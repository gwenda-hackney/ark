/**
 * Guardrail: every Pages Function dependency must resolve inside web/functions.
 * Catches broken cross-repo imports before deploy.
 */
import { describe, expect, it } from "vitest";

const modules = [
  "../api/rsvp.js",
  "../api/subscribe.js",
  "../api/events.js",
  "../api/auth.js",
  "./event-password.js",
  "./rsvp.js",
  "./sanity-event.js",
];

describe("Pages Function imports", () => {
  for (const specifier of modules) {
    it(`loads ${specifier}`, async () => {
      await expect(import(specifier)).resolves.toBeDefined();
    });
  }
});
