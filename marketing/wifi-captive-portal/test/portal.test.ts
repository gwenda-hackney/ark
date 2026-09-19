import { describe, expect, it, vi } from "vitest";
import { normalizeEmail, subscribeEmailToBaserow } from "../src/baserow.js";
import { handlePortalRequest } from "../src/handler.js";
import type { Env } from "../src/types.js";
import {
  clearSubscribeTableIdCache,
  resolveSubscribeTableId,
} from "../src/types.js";
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

describe("types", () => {
  it("resolves Subscribers by name", async () => {
    clearSubscribeTableIdCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 1017358, name: "Subscribers", database_id: 461843 },
        ],
      })),
    );
    await expect(resolveSubscribeTableId(env)).resolves.toBe("1017358");
    vi.unstubAllGlobals();
  });

  it("errors when the token can see more than one Subscribers table", async () => {
    clearSubscribeTableIdCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 1017358, name: "Subscribers", database_id: 461843 },
          { id: 1024006, name: "Subscribers", database_id: 563090 },
        ],
      })),
    );
    await expect(resolveSubscribeTableId(env)).rejects.toThrow(/Website database/);
    vi.unstubAllGlobals();
  });
});

describe("baserow", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Dan@Gwenda.co.uk ")).toBe("dan@gwenda.co.uk");
    expect(normalizeEmail("nope")).toBeNull();
  });

  it("posts a Synced=false wifi row with Tag as an array", async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        url: String(url),
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (method === "GET") {
        return Response.json({ results: [] });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await subscribeEmailToBaserow({
      email: "Guest@Example.com",
      tag: "wifi",
      apiKey: "token",
      apiUrl: "https://api.baserow.io",
      tableId: "1017358",
      fetchImpl,
    });
    expect(result).toEqual({ ok: true });
    expect(calls[0]?.url).toContain("filter__Email__equal=guest%40example.com");
    expect(calls[1]?.body).toMatchObject({
      Email: "guest@example.com",
      Tag: ["wifi"],
      Synced: false,
    });
  });

  it("merges wifi onto an existing prelaunch row and clears Synced", async () => {
    const calls: { method?: string; body?: unknown }[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (method === "GET") {
        return Response.json({
          results: [
            {
              id: 42,
              Email: "guest@example.com",
              Tag: [{ id: 1, value: "prelaunch", color: "blue" }],
              Synced: true,
            },
          ],
        });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await subscribeEmailToBaserow({
      email: "guest@example.com",
      tag: "wifi",
      apiKey: "token",
      apiUrl: "https://api.baserow.io",
      tableId: "1017358",
      fetchImpl,
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
      method: "PATCH",
      body: { Tag: ["prelaunch", "wifi"], Synced: false },
    });
  });

  it("no-ops when the email already has the wifi tag", async () => {
    let patched = false;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "PATCH") patched = true;
      return Response.json({
        results: [
          {
            id: 42,
            Email: "guest@example.com",
            Tag: ["prelaunch", "wifi"],
            Synced: true,
          },
        ],
      });
    }) as unknown as typeof fetch;

    const result = await subscribeEmailToBaserow({
      email: "guest@example.com",
      tag: "wifi",
      apiKey: "token",
      apiUrl: "https://api.baserow.io",
      tableId: "1017358",
      fetchImpl,
    });
    expect(result).toEqual({ ok: true });
    expect(patched).toBe(false);
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
    clearSubscribeTableIdCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/all-tables/")) {
          return {
            ok: true,
            json: async () => [
              { id: 1017358, name: "Subscribers", database_id: 461843 },
            ],
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    const subscribe = vi.fn(async () => ({ ok: true as const }));
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
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "guest@example.com",
        tag: "wifi",
        tableId: "1017358",
      }),
    );
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
