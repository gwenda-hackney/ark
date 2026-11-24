import { describe, expect, it, vi } from "vitest";
import { memorySubscriberRepository } from "../../../shared/guests/adapters/memory-subscribers.js";
import { handlePortalRequest, subscribeEmail } from "../src/handler.js";
import type { Env } from "../src/types.js";
import { authorizeGuest } from "../src/unifi.js";

const env: Env = {
  WEBSITE_DB: {},
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
      marketing: true,
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
    await subscribeEmail(repoEnv, {
      email: "guest@example.com",
      tag: "wifi",
      marketing: true,
    });
    expect(await repo.listByEmail("guest@example.com")).toMatchObject([
      { tags: ["prelaunch", "wifi"], signedUpOn: "2026-07-04", synced: false },
    ]);
  });

  it("a tick from someone already tagged wifi records their consent again", async () => {
    const { repo, env: repoEnv } = withRepo();
    await repo.create({
      email: "guest@example.com",
      tags: ["prelaunch", "wifi"],
      signedUpOn: "2026-07-04",
      marketing: false,
      marketingOffOn: "2026-10-01",
      synced: true,
    });
    await subscribeEmail(repoEnv, {
      email: "guest@example.com",
      tag: "wifi",
      marketing: true,
    });
    expect(await repo.listByEmail("guest@example.com")).toMatchObject([
      { tags: ["prelaunch", "wifi"], marketing: true, marketingOffOn: null, synced: false },
    ]);
  });
});

describe("marketing consent", () => {
  const guestEnv = () => {
    const subscriberRepository = memorySubscriberRepository();
    return {
      subscribers: subscriberRepository,
      env: { ...env, subscriberRepository } as Env,
    };
  };
  const today = new Date().toISOString().slice(0, 10);
  const authorize = async () => ({ ok: true as const });
  const submit = (testEnv: Env, fields: Record<string, string>) =>
    handlePortalRequest(
      new Request("https://wifi.example/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id: "aa:bb:cc:dd:ee:ff", ...fields }),
      }),
      testEnv,
      { authorize },
    );

  it("shows the newsletter box unticked, apart from the required email", async () => {
    const page = await handlePortalRequest(
      new Request("https://wifi.example/guest/s/default/?id=aa:bb:cc:dd:ee:ff"),
      env,
    );
    const html = await page.text();
    const box = html.match(/<input[^>]*name="marketing"[^>]*>/)?.[0];
    expect(box).toBeDefined();
    expect(box).toContain('type="checkbox"');
    expect(box).not.toMatch(/\bchecked\b/);
    expect(box).not.toMatch(/\brequired\b/);
    expect(html).toContain("Send me what’s on at Gwenda");
    expect(html).not.toContain("The occasional note from Gwenda");
  });

  it("without the box: gets online, kept with today's visit, not on the mailing list", async () => {
    const { env: testEnv, subscribers } = guestEnv();
    const post = await submit(testEnv, { email: "Guest@Example.com" });
    expect(post.status).toBe(200);
    expect(await post.text()).toContain("Connected");
    expect(await subscribers.listByEmail("guest@example.com")).toMatchObject([
      { tags: ["wifi"], marketing: false, marketingOn: null, lastSeenOn: today },
    ]);
    expect(await subscribers.listUnsynced({ all: true })).toEqual([]);
  });

  it("with the box: on the mailing list, tagged wifi, to sync", async () => {
    const { env: testEnv, subscribers } = guestEnv();
    const post = await submit(testEnv, {
      email: "guest@example.com",
      marketing: "yes",
    });
    expect(post.status).toBe(200);
    expect(await subscribers.listUnsynced()).toMatchObject([
      {
        email: "guest@example.com",
        tags: ["wifi"],
        marketing: true,
        marketingOn: today,
        lastSeenOn: today,
        synced: false,
      },
    ]);
  });

  it("without the box leaves an existing subscriber as they were, but for the visit", async () => {
    const { env: testEnv, subscribers } = guestEnv();
    await subscribers.create({
      email: "guest@example.com",
      tags: ["prelaunch"],
      signedUpOn: "2026-07-04",
      marketingOn: "2026-07-04",
      synced: true,
    });
    await submit(testEnv, { email: "guest@example.com" });
    expect(await subscribers.listByEmail("guest@example.com")).toMatchObject([
      {
        tags: ["prelaunch"],
        signedUpOn: "2026-07-04",
        marketing: true,
        marketingOn: "2026-07-04",
        lastSeenOn: today,
        synced: true,
      },
    ]);
  });

  it("gets the guest online when the sign-up can't be saved, and logs it", async () => {
    const { env: testEnv, subscribers } = guestEnv();
    vi.spyOn(subscribers, "listByEmail").mockRejectedValue(
      new Error("D1_ERROR: no such column: marketing"),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const post = await submit(testEnv, { email: "guest@example.com" });
    expect(post.status).toBe(200);
    expect(await post.text()).toContain("Connected");
    expect(logged).toHaveBeenCalledWith(
      "[wifi-captive-portal] Sign-up not saved; guest let on anyway",
      502,
      expect.any(String),
    );
    logged.mockRestore();
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
      expect(html).toContain('alt="Gwenda Social"');
      expect(html).toContain('src="/logo.svg"');
      expect(html).toContain("Protest Strike");
      expect(html).toContain("Get online");
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
          marketing: "yes",
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
      marketing: true,
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

  it.each([
    ["can't save it", async () => ({ ok: false as const, status: 502, error: "Saving failed." })],
    ["throws", async () => { throw new Error("D1_ERROR: no such table"); }],
  ])("lets the guest on when the sign-up %s, and logs it", async (_, failing) => {
    const subscribe = vi.fn(failing);
    const authorize = vi.fn(async () => ({ ok: true as const }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const post = await handlePortalRequest(
      new Request("https://wifi.example/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: "guest@example.com", id: "aa:bb:cc:dd:ee:ff", marketing: "yes" }),
      }),
      env,
      { subscribe: subscribe as never, authorize },
    );

    expect(post.status).toBe(200);
    expect(await post.text()).toContain("Connected");
    expect(authorize).toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      "[wifi-captive-portal] Sign-up not saved; guest let on anyway",
      ...(_ === "throws" ? [expect.stringContaining("no such table")] : [502, "Saving failed."]),
    );
    logged.mockRestore();
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

describe("a guest coming back", () => {
  const subscribe = vi.fn(async () => ({ ok: true as const, status: 200 as const, subscriber: null, changed: true }));
  const authorize = vi.fn(async () => ({ ok: true as const }));
  const signIn = (email: string) =>
    handlePortalRequest(
      new Request("https://wifi.example/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email, id: "aa:bb:cc:dd:ee:ff", site: "default" }),
      }),
      env,
      { subscribe, authorize },
    );
  const page = (cookie = "") =>
    handlePortalRequest(
      new Request("https://wifi.example/guest/s/default/?id=aa:bb:cc:dd:ee:ff", { headers: cookie ? { Cookie: cookie } : {} }),
      env,
      { subscribe, authorize },
    );
  const cookieFrom = (res: Response) => (res.headers.get("Set-Cookie") || "").split(";")[0];

  it("finds their email filled in on this phone, so getting online is one tap", async () => {
    const first = await signIn("Guest@Example.com");
    expect(first.status).toBe(200);
    const setCookie = first.headers.get("Set-Cookie") || "";
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/Max-Age=31536000/);

    const back = await (await page(cookieFrom(first))).text();
    expect(back).toContain('value="guest@example.com"');
    expect(back).toContain("Welcome back");
  });

  it("a phone that hasn't signed in here sees an empty email", async () => {
    const html = await (await page()).text();
    expect(html).not.toContain("Welcome back");
    expect(html).toMatch(/<input id="email"[^>]*value=""/);
  });

  it("a cookie that isn't an email is ignored", async () => {
    const html = await (await page('gwenda_wifi_email="><script>x</script>')).text();
    expect(html).not.toContain("<script>x");
    expect(html).not.toContain("Welcome back");
  });
});
