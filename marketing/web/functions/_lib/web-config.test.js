import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryConfigRepository } from "../../../../shared/config-adapters/memory-config.js";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { resolveFormNotifyTo } from "../../../../shared/forms/notify-to.js";

/** An env whose config database holds these records. */
const withRecords = (env, records) => ({
  ...env,
  configRepository: memoryConfigRepository(records),
});

const row = (name, value, env, service) => ({ name, value, env, service });

/** A config database that can't be read. */
const down = {
  list: async () => {
    const error = new Error("Config D1: down");
    error.status = 503;
    throw error;
  },
};

describe("resolveFormNotifyTo", () => {
  afterEach(() => {
    resetConfigCacheForTests();
    vi.unstubAllGlobals();
  });

  it("prod uses the Sanity form address without a config token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("should not fetch");
      }),
    );
    expect(
      await resolveFormNotifyTo(
        { SITE_ENV: "production" },
        { notifyEmail: "play@gwenda.co.uk" },
      ),
    ).toBe("play@gwenda.co.uk");
  });

  it("outside prod, never falls back to the form's real inbox", async () => {
    const form = { notifyEmail: "play@gwenda.co.uk" };
    // A developer's machine without their own address.
    await expect(
      resolveFormNotifyTo({ SITE_ENV: "local" }, form),
    ).rejects.toThrow(/FORMS_NOTIFY_EMAIL is not set/);
    // Settings reachable but no override row for this env.
    await expect(
      resolveFormNotifyTo(
        withRecords({ SITE_ENV: "dev" }, [
          row("forms.notify_email", "dev@gwenda.co.uk", "production", "web"),
        ]),
        form,
      ),
    ).rejects.toThrow(/not set for dev/);
  });

  it("prefers this env's forms.notify_email row", async () => {
    const env = withRecords({ SITE_ENV: "dev" }, [
      row("forms.notify_email", "dev@gwenda.co.uk", "dev", "web"),
    ]);
    expect(
      await resolveFormNotifyTo(env, { notifyEmail: "play@gwenda.co.uk" }),
    ).toBe("dev@gwenda.co.uk");
  });

  it("ignores other envs' overrides", async () => {
    const env = withRecords({ SITE_ENV: "production" }, [
      row("forms.notify_email", "dev@gwenda.co.uk", "local", "web"),
    ]);
    expect(
      await resolveFormNotifyTo(env, { notifyEmail: "play@gwenda.co.uk" }),
    ).toBe("play@gwenda.co.uk");
  });

  it("prod falls back to the form address when config is down", async () => {
    const env = { SITE_ENV: "production", configRepository: down };
    expect(
      await resolveFormNotifyTo(env, { notifyEmail: "play@gwenda.co.uk" }),
    ).toBe("play@gwenda.co.uk");
  });

  it("hosted dev uses the config row; a developer's machine can override it", async () => {
    const records = [
      row("forms.notify_email", "alerts@gwenda.co.uk", "dev", "web"),
    ];
    const form = { notifyEmail: "play@gwenda.co.uk" };
    expect(
      await resolveFormNotifyTo(withRecords({ SITE_ENV: "dev" }, records), form),
    ).toBe("alerts@gwenda.co.uk");
    expect(
      await resolveFormNotifyTo(
        withRecords(
          { SITE_ENV: "local", FORMS_NOTIFY_EMAIL: "me@gwenda.co.uk" },
          records,
        ),
        form,
      ),
    ).toBe("me@gwenda.co.uk");
  });

  it("outside prod, config down means no email", async () => {
    const env = { SITE_ENV: "preview", configRepository: down };
    await expect(
      resolveFormNotifyTo(env, { notifyEmail: "play@gwenda.co.uk" }),
    ).rejects.toThrow();
  });
});
