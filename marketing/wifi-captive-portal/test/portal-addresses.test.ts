import { describe, expect, it, vi } from "vitest";
import {
  isCloudflareAddress,
  planPortalAddresses,
  runPortalAddressCheck,
  type GuestAccess,
} from "../src/portal-addresses.js";
import type { Env } from "../src/types.js";

const env: Env = {
  WEBSITE_DB: {},
  UNIFI_SITE_MANAGER_API_KEY: "sm-key",
  UNIFI_CONSOLE_ID: "console:1",
};

/** The router's hotspot settings as they were when the page went blank (26 Nov). */
const stale = (): GuestAccess => ({
  _id: "ga1",
  key: "guest_access",
  portal_hostname: "wifi.gwenda.co.uk",
  custom_ip: "172.67.135.40",
  allowed_subnet_1: "wifi.gwenda.co.uk",
  allowed_subnet_2: "gwenda.co.uk",
  allowed_subnet_3: "www.gwenda.co.uk",
  restricted_subnet_1: "192.168.0.0/16",
});

/** A fake DNS-over-HTTPS and UniFi Site Manager, recording what was sent. */
function fakeNet(settings: GuestAccess, addresses = ["172.67.135.192", "104.21.7.48"], opts: { putStatus?: number } = {}) {
  const puts: GuestAccess[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://cloudflare-dns.com/")) {
      return Response.json({ Answer: addresses.map((data) => ({ type: 1, data })) });
    }
    if (url.endsWith("/rest/setting") && (init?.method ?? "GET") === "GET") {
      return Response.json({ data: [{ key: "mgmt" }, settings] });
    }
    if (url.endsWith("/rest/setting/guest_access/ga1") && init?.method === "PUT") {
      puts.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ meta: { rc: "ok" } }), { status: opts.putStatus ?? 200 });
    }
    return new Response("not found", { status: 404 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, puts };
}

describe("Cloudflare addresses", () => {
  it("knows the portal's addresses are Cloudflare's, and host names and subnets aren't ours", () => {
    expect(isCloudflareAddress("172.67.135.192")).toBe(true);
    expect(isCloudflareAddress("104.21.7.48")).toBe(true);
    expect(isCloudflareAddress("wifi.gwenda.co.uk")).toBe(false);
    expect(isCloudflareAddress("192.168.0.0/16")).toBe(false);
    expect(isCloudflareAddress("8.8.8.8")).toBe(false);
  });
});

describe("the router follows the portal's addresses", () => {
  it("adds the current addresses and points the portal IP at them, keeping the host names", () => {
    const plan = planPortalAddresses(stale(), ["104.21.7.48", "172.67.135.192"]);
    expect(plan.changed).toBe(true);
    expect(plan.settings).toMatchObject({
      custom_ip: "104.21.7.48",
      allowed_subnet_1: "wifi.gwenda.co.uk",
      allowed_subnet_2: "gwenda.co.uk",
      allowed_subnet_3: "www.gwenda.co.uk",
      allowed_subnet_4: "104.21.7.48",
      allowed_subnet_5: "172.67.135.192",
      restricted_subnet_1: "192.168.0.0/16",
      portal_hostname: "wifi.gwenda.co.uk",
    });
  });

  it("replaces old addresses and empties the slots left over", () => {
    const plan = planPortalAddresses(
      { ...stale(), custom_ip: "172.67.135.192", allowed_subnet_4: "172.67.135.192", allowed_subnet_5: "104.21.7.48", allowed_subnet_6: "10.9.8.7" },
      ["188.114.96.1"],
    );
    expect(plan.after.allowed).toEqual(["wifi.gwenda.co.uk", "gwenda.co.uk", "www.gwenda.co.uk", "10.9.8.7", "188.114.96.1"]);
    expect(plan.settings.allowed_subnet_6).toBe("");
  });

  it("keeps the router's portal IP while it's still one of the portal's addresses (as set by hand on 26 Nov)", () => {
    const byHand = { ...stale(), custom_ip: "172.67.135.192", allowed_subnet_4: "172.67.135.192", allowed_subnet_5: "104.21.7.48" };
    expect(planPortalAddresses(byHand, ["104.21.7.48", "172.67.135.192"]).changed).toBe(false);
  });

  it("changes nothing when the router already has the current addresses", () => {
    const current = planPortalAddresses(stale(), ["104.21.7.48", "172.67.135.192"]).settings;
    expect(planPortalAddresses(current, ["104.21.7.48", "172.67.135.192"]).changed).toBe(false);
  });

  it("on a change, saves the router's settings and tells Sentry (console.error) old and new", async () => {
    const { fetchImpl, puts } = fakeNet(stale());
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runPortalAddressCheck(env, fetchImpl);
    expect(result?.status).toBe("updated");
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ custom_ip: "104.21.7.48", allowed_subnet_4: "104.21.7.48", allowed_subnet_5: "172.67.135.192" });
    expect(error.mock.calls[0][0]).toMatch(/now lets guests reach 104\.21\.7\.48 \(was 172\.67\.135\.40\)/);
    error.mockRestore();
  });

  it("with nothing to change, saves nothing and raises no alert", async () => {
    const current = planPortalAddresses(stale(), ["104.21.7.48", "172.67.135.192"]).settings;
    const { fetchImpl, puts } = fakeNet(current);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect((await runPortalAddressCheck(env, fetchImpl))?.status).toBe("unchanged");
    expect(puts).toHaveLength(0);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
    log.mockRestore();
  });

  it("when the router refuses the update, raises an alert saying so", async () => {
    const { fetchImpl } = fakeNet(stale(), undefined, { putStatus: 401 });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runPortalAddressCheck(env, fetchImpl)).toBeNull();
    expect(error.mock.calls[0].join(" ")).toMatch(/Couldn't check the router lets guests reach the portal.*401/);
    error.mockRestore();
  });
});
