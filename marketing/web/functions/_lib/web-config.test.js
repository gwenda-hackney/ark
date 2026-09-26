import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { resolveFormNotifyTo } from "../../../../shared/forms/notify-to.js";

function stubConfigRows(rows) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (String(url).includes("/all-tables/")) {
        return new Response(
          JSON.stringify([{ id: 5, name: "Config", database_id: 1 }]),
        );
      }
      return new Response(JSON.stringify({ results: rows, next: null }));
    }),
  );
}

const row = (Name, Value, Env, Service) => ({
  Name,
  Value,
  Env: { value: Env },
  Service: { value: Service },
});

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
    stubConfigRows([
      row("forms.notify_email", "dev@gwenda.co.uk", "production", "web"),
    ]);
    await expect(
      resolveFormNotifyTo(
        { SITE_ENV: "dev", BASEROW_CONFIG_API_KEY: "cfg" },
        form,
      ),
    ).rejects.toThrow(/not set for dev/);
  });

  it("prefers this env's forms.notify_email row", async () => {
    stubConfigRows([
      row("forms.notify_email", "dev@gwenda.co.uk", "dev", "web"),
    ]);
    const env = { SITE_ENV: "dev", BASEROW_CONFIG_API_KEY: "cfg" };
    expect(
      await resolveFormNotifyTo(env, { notifyEmail: "play@gwenda.co.uk" }),
    ).toBe("dev@gwenda.co.uk");
  });

  it("ignores other envs' overrides", async () => {
    stubConfigRows([
      row("forms.notify_email", "dev@gwenda.co.uk", "local", "web"),
    ]);
    const env = { SITE_ENV: "production", BASEROW_CONFIG_API_KEY: "cfg" };
    expect(
      await resolveFormNotifyTo(env, { notifyEmail: "play@gwenda.co.uk" }),
    ).toBe("play@gwenda.co.uk");
  });

  it("prod falls back to the form address when config is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const env = { SITE_ENV: "production", BASEROW_CONFIG_API_KEY: "cfg" };
    expect(
      await resolveFormNotifyTo(env, { notifyEmail: "play@gwenda.co.uk" }),
    ).toBe("play@gwenda.co.uk");
  });

  it("hosted dev uses the config row; a developer's machine can override it", async () => {
    stubConfigRows([
      row("forms.notify_email", "alerts@gwenda.co.uk", "dev", "web"),
    ]);
    const form = { notifyEmail: "play@gwenda.co.uk" };
    expect(
      await resolveFormNotifyTo(
        { SITE_ENV: "dev", BASEROW_CONFIG_API_KEY: "cfg" },
        form,
      ),
    ).toBe("alerts@gwenda.co.uk");
    expect(
      await resolveFormNotifyTo(
        {
          SITE_ENV: "local",
          BASEROW_CONFIG_API_KEY: "cfg",
          FORMS_NOTIFY_EMAIL: "me@gwenda.co.uk",
        },
        form,
      ),
    ).toBe("me@gwenda.co.uk");
  });

  it("outside prod, config down means no email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const env = { SITE_ENV: "preview", BASEROW_CONFIG_API_KEY: "cfg" };
    await expect(
      resolveFormNotifyTo(env, { notifyEmail: "play@gwenda.co.uk" }),
    ).rejects.toThrow();
  });
});
