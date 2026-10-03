import { describe, expect, it } from "vitest";
import {
  createWebsitePass,
  opsUrlFor,
  passReturnUrl,
  verifyWebsitePass,
} from "./website-pass.js";

const HOST = "preview.gwenda-blue.pages.dev";

describe("website pass", () => {
  it("works on the site it was made for, within five minutes", async () => {
    const pass = await createWebsitePass("key", HOST, 1000);
    expect(await verifyWebsitePass("key", pass, HOST, 1000 + 4 * 60_000)).toBe(
      true,
    );
  });

  it("fails on another site, after five minutes, with another key, or edited", async () => {
    const pass = await createWebsitePass("key", HOST, 1000);
    expect(
      await verifyWebsitePass("key", pass, "feat-x.gwenda-blue.pages.dev", 1000),
    ).toBe(false);
    expect(await verifyWebsitePass("key", pass, HOST, 1000 + 6 * 60_000)).toBe(
      false,
    );
    expect(await verifyWebsitePass("other", pass, HOST, 1000)).toBe(false);
    const [body, sig] = pass.split(".");
    const forged = btoa(JSON.stringify({ host: HOST, exp: 9e15 }))
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(await verifyWebsitePass("key", `${forged}.${sig}`, HOST, 1000)).toBe(
      false,
    );
    expect(await verifyWebsitePass("key", `${body}.${sig}.x`, HOST, 1000)).toBe(
      false,
    );
    expect(await verifyWebsitePass("key", "", HOST, 1000)).toBe(false);
    expect(await verifyWebsitePass("", pass, HOST, 1000)).toBe(false);
  });
});

describe("passReturnUrl", () => {
  it("production ops allows the production previews only", () => {
    const url = "https://preview.gwenda-blue.pages.dev/whats-on";
    expect(passReturnUrl(url, "production")?.href).toBe(url);
    expect(
      passReturnUrl("https://preview.gwenda-web-dev.pages.dev/", "production"),
    ).toBe(null);
  });

  it("dev ops allows the dev previews only", () => {
    for (const url of [
      "https://preview.gwenda-web-dev.pages.dev/",
      "https://feat-event-galleries.gwenda-web-dev.pages.dev/menu?x=1",
      "https://gwenda-web-dev.pages.dev/",
    ]) {
      expect(passReturnUrl(url, "dev")?.href).toBe(new URL(url).href);
    }
    expect(
      passReturnUrl("https://preview.gwenda-blue.pages.dev/", "dev"),
    ).toBe(null);
  });

  it("refuses anywhere else", () => {
    for (const url of [
      "http://preview.gwenda-blue.pages.dev/",
      "https://evil.example/",
      "https://gwenda-blue.pages.dev.evil.example/",
      "https://evilgwenda-blue.pages.dev/",
      "https://a.b.gwenda-blue.pages.dev/",
      "https://preview.gwenda-blue.pages.dev:8443/",
      "https://user@preview.gwenda-blue.pages.dev/",
      "/relative",
      "",
    ]) {
      expect(passReturnUrl(url, "production")).toBe(null);
    }
  });
});

describe("opsUrlFor", () => {
  it("sends production previews to production ops, the rest to dev ops", () => {
    expect(opsUrlFor("production")).toBe("https://gwenda-ops.pages.dev");
    expect(opsUrlFor("dev")).toBe("https://gwenda-ops-dev.pages.dev");
  });
});
