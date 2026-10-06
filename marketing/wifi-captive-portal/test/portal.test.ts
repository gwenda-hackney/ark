import { describe, expect, it, vi } from "vitest";
import { memorySubscriberRepository } from "../../../shared/guests/adapters/memory-subscribers.js";
import { handlePortalRequest, subscribeEmail } from "../src/handler.js";
import type { Env } from "../src/types.js";
import { authorizeGuest } from "../src/unifi.js";

const env: Env = {
  BASEROW_API_KEY: "baserow-key",
  UNIFI_SITE_MANAGER_API_KEY: "sm-key",
  UNIFI_CONSOLE_ID:
    "A89C6C0EB1810000000009A42CB9000000000A2C1924000000006920A430:1883747293",
  ASSETS: {
    fetch: async () => new Response("asset", { status: 200 }),
  } as unknown as Env["ASSETS"],
  WIFI_SUBSCRIBE_TAG: "wifi",
};

describe("sign-up", () => {
  const withRepo = () => {
    const subscriberRepository = memorySubscriberRepository();
    return {
      repo: subscriberRepository,
      env: { ...env, subscriberRepository } as Env,
    };
  };

  it("saves an unsynced wifi sign-up, the address in lower case", async () => {
    const { repo, env: repoEnv } = withRepo();
    const result = await subscribeEmail(repoEnv, {
      email: "Guest@Example.com",
      tag: "wifi",
    });
    expect(result.ok).toBe(true);
    expect(await repo.listByEmail("guest@example.com")).toMatchObject([
      { email: "guest@example.com", tags: ["wifi"], synced: false },
    ]);
  });

  it("merges wifi onto an existing prelaunch sign-up and syncs it again", async () => {
    const { repo, env: repoEnv } = withRepo();
    await repo.create({
      email: "guest@example.com",
      tags: ["prelaunch"],
      signedUpOn: "2026-07-04",
      synced: true,
    });
    await subscribeEmail(repoEnv, { email: "guest@example.com", tag: "wifi" });
    expect(await repo.listByEmail("guest@example.com")).toMatchObject([
      { tags: ["prelaunch", "wifi"], signedUpOn: "2026-07-04", synced: false },
    ]);
  });

  it("no-ops when the email already has the wifi tag", async () => {
    const { repo, env: repoEnv } = withRepo();
    await repo.create({
      email: "guest@example.com",
      tags: ["prelaunch", "wifi"],
      signedUpOn: "2026-07-04",
      synced: true,
    });
    const update = vi.spyOn(repo, "update");
    await subscribeEmail(repoEnv, { email: "guest@example.com", tag: "wifi" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("unifi site manager authorize", () => {
  it("posts authorize-guest through the connector proxy", async () => {
    let calledUrl = "";
    let calledBody: unknown;
    let calledKey = "";

    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calledUrl = String(url);
      calledBody = JSON.parse(String(init?.body));
      calledKey = String(
        (init?.headers as Record<string, string>)?.["X-API-KEY"] ?? "",
      );
      return new Response('{"meta":{"rc":"ok"}}', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await authorizeGuest(
      env,
      { mac: "AA-BB-CC-DD-EE-FF", apMac: "11:22:33:44:55:66" },
      fetchImpl,
    );

    expect(result).toEqual({ ok: true });
    expect(calledKey).toBe("sm-key");
    expect(calledUrl).toContain(
      "/v1/connector/consoles/A89C6C0EB1810000000009A42CB9000000000A2C1924000000006920A430:1883747293/network/api/s/default/cmd/stamgr",
    );
    expect(calledBody).toMatchObject({
      cmd: "authorize-guest",
      mac: "aa:bb:cc:dd:ee:ff",
      ap_mac: "11:22:33:44:55:66",
      minutes: 1440,
    });
  });

  it("uses submitted site identifier when provided", async () => {
    let calledUrl = "";
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return new Response('{"meta":{"rc":"ok"}}', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await authorizeGuest(
      env,
      { mac: "aa:bb:cc:dd:ee:ff", siteIdentifier: "events" },
      fetchImpl,
    );

    expect(result).toEqual({ ok: true });
    expect(calledUrl).toContain("/network/api/s/events/cmd/stamgr");
  });
});

describe("handler", () => {
  it("serves the UniFi guest path and authorizes on submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        throw new Error(`Unexpected fetch: ${String(input)}`);
      }),
    );
    const subscribe = vi.fn(async () => ({
      ok: true as const,
      status: 200 as const,
      subscriber: null,
      changed: true,
    }));
    const authorize = vi.fn(async () => ({ ok: true as const }));

    const page = await handlePortalRequest(
      new Request(
        "https://wifi.example/guest/s/default/?id=aa:bb:cc:dd:ee:ff&ap=11:22:33:44:55:66",
      ),
      env,
      { subscribe, authorize },
    );
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain('alt="Gwenda"');
      expect(html).toContain('src="/logo.png"');
      expect(html).toContain("Cormorant Garamond");
      expect(html).toContain("Enter our world");
      expect(html).toContain("Guest Wi‑Fi");
      expect(html).toContain('value="aa:bb:cc:dd:ee:ff"');

    const post = await handlePortalRequest(
      new Request("https://wifi.example/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: "guest@example.com",
          id: "aa:bb:cc:dd:ee:ff",
          ap: "11:22:33:44:55:66",
          url: "https://gwenda.co.uk",
          site: "default",
        }),
      }),
      env,
      { subscribe, authorize },
    );
    expect(post.status).toBe(200);
    expect(await post.text()).toContain("Connected");
    expect(subscribe).toHaveBeenCalledWith(env, {
      email: "guest@example.com",
      tag: "wifi",
    });
    expect(authorize).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        mac: "aa:bb:cc:dd:ee:ff",
        siteIdentifier: "default",
      }),
    );
    vi.unstubAllGlobals();
  });

  it("exposes health", async () => {
    const res = await handlePortalRequest(
      new Request("https://wifi.example/health"),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      service: "gwenda-wifi-captive-portal",
    });
  });
});
