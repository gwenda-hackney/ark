import { describe, expect, it, vi } from "vitest";
import { normalizeEmail, subscribeEmailToBaserow } from "../src/baserow.js";
import { handlePortalRequest } from "../src/handler.js";
import type { Env } from "../src/types.js";
import { resolveTableId } from "../src/types.js";
import { authorizeGuest } from "../src/unifi.js";

const env: Env = {
  BASEROW_API_KEY: "baserow-key",
  UNIFI_SITE_MANAGER_API_KEY: "sm-key",
  UNIFI_CONSOLE_ID:
    "A89C6C0EB1810000000009A42CB9000000000A2C1924000000006920A430:1883747293",
  ASSETS: {
    fetch: async () => new Response("asset", { status: 200 }),
  } as unknown as Env["ASSETS"],
  BASEROW_TABLE_ID: "1017358",
  WIFI_SUBSCRIBE_TAG: "wifi",
};

describe("types", () => {
  it("defaults to production subscribe table", () => {
    expect(resolveTableId({} as Env)).toBe("1017358");
  });
});

describe("baserow", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Dan@Gwenda.co.uk ")).toBe("dan@gwenda.co.uk");
    expect(normalizeEmail("nope")).toBeNull();
  });

  it("posts a Synced=false wifi row", async () => {
    let posted: unknown;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      posted = JSON.parse(String(init?.body));
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
    expect(posted).toMatchObject({
      Email: "guest@example.com",
      Tag: "wifi",
      Synced: false,
    });
  });

  it("treats duplicate emails as success", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: "ERROR_FIELD_DATA_CONSTRAINT",
          detail: "unique",
        }),
        { status: 400 },
      )) as unknown as typeof fetch;

    const result = await subscribeEmailToBaserow({
      email: "guest@example.com",
      tag: "wifi",
      apiKey: "token",
      apiUrl: "https://api.baserow.io",
      tableId: "1017358",
      fetchImpl,
    });
    expect(result).toEqual({ ok: true });
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
});

describe("handler", () => {
  it("serves the UniFi guest path and authorizes on submit", async () => {
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
      expect.objectContaining({ mac: "aa:bb:cc:dd:ee:ff" }),
    );
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
