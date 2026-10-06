import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNUP_SMOKE_EMAIL } from "../../../../shared/smoke-test.js";
import { memorySubscriberRepository } from "../../../../shared/guests/adapters/memory-subscribers.js";
import { runSignupSmoke } from "./signup-smoke.js";

describe("runSignupSmoke", () => {
  let subscribers;
  let env;
  beforeEach(() => {
    subscribers = memorySubscriberRepository();
    env = { subscriberRepository: subscribers };
  });
  afterEach(() => vi.restoreAllMocks());

  it("signs up, merges the second tag, and leaves no record", async () => {
    const create = vi.spyOn(subscribers, "create");
    const update = vi.spyOn(subscribers, "update");
    const detail = await runSignupSmoke(env);
    expect(detail).toContain(SIGNUP_SMOKE_EMAIL);
    expect(create.mock.calls.map(([fields]) => fields.tags)).toEqual([
      ["prelaunch"],
    ]);
    expect(update.mock.calls.map(([, fields]) => fields.tags)).toEqual([
      ["prelaunch", "wifi"],
    ]);
    expect(await subscribers.count()).toBe(0);
  });

  it("clears a record a failed run left behind first", async () => {
    await subscribers.create({
      email: SIGNUP_SMOKE_EMAIL,
      tags: ["prelaunch", "wifi"],
      signedUpOn: "2026-10-01",
      synced: false,
    });
    await runSignupSmoke(env);
    expect(await subscribers.count()).toBe(0);
  });

  it("names the step that failed, and still cleans up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(subscribers, "create").mockRejectedValue(
      Object.assign(new Error("Baserow 500"), { status: 502 }),
    );
    await expect(runSignupSmoke(env)).rejects.toThrow(/^Signing up failed/);
    expect(await subscribers.count()).toBe(0);
  });

  it("fails when a sign-up doesn't stick", async () => {
    // Storage accepts the create but the record never appears.
    vi.spyOn(subscribers, "create").mockResolvedValue({ id: 1 });
    await expect(runSignupSmoke(env)).rejects.toThrow(
      "After signing up: expected one row for the test address, found 0.",
    );
  });
});
