import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAppleWalletPass,
  buildCalendarTicket,
  formatTicketTitle,
  WALLET_STRIP_SIZES,
  walletStripImageUrl,
} from "./rsvp-tickets.js";
import { fetchImageBuffer } from "../../../../shared/email-image.js";

const APPLE_WALLET_ENV = {
  APPLE_WALLET_PASS_TYPE_ID: "pass.co.uk.gwenda.events",
  APPLE_WALLET_TEAM_ID: "TEAMID1234",
  APPLE_WALLET_SIGNER_CERT: "cert",
  APPLE_WALLET_SIGNER_KEY: "key",
  APPLE_WALLET_WWDR_CERT: "wwdr",
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("formatTicketTitle", () => {
  it("prefixes Gwenda when missing", () => {
    expect(formatTicketTitle("Launch Party")).toBe("Gwenda Launch Party");
  });

  it("leaves an existing Gwenda prefix alone", () => {
    expect(formatTicketTitle("Gwenda Launch Party")).toBe(
      "Gwenda Launch Party",
    );
  });

  it("falls back when the title is empty", () => {
    expect(formatTicketTitle("")).toBe("Gwenda Launch Party");
  });
});

describe("buildCalendarTicket", () => {
  it("moves an after-midnight end time to the next day", () => {
    const calendar = buildCalendarTicket({
      ticketId: "gwenda-nights-1",
      title: "Gwenda Nights",
      date: "2026-09-26",
      startTime: "16:00",
      endTime: "01:30",
    }).toString("utf8");

    const start = calendar.match(/DTSTART:(\d+T\d+Z)/)?.[1];
    const end = calendar.match(/DTEND:(\d+T\d+Z)/)?.[1];
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    expect(end > start).toBe(true);
  });
});

describe("walletStripImageUrl", () => {
  it("builds a cropped Sanity strip URL", () => {
    const url = walletStripImageUrl(
      "https://cdn.sanity.io/images/demo/production/hero.jpg",
      750,
      196,
    );
    expect(url).toBe(
      "https://cdn.sanity.io/images/demo/production/hero.jpg?w=750&h=196&fit=crop&auto=format",
    );
  });

  it("appends to an existing query string", () => {
    const url = walletStripImageUrl(
      "https://cdn.sanity.io/images/demo/hero.jpg?dpr=2",
      375,
      98,
    );
    expect(url).toContain("&w=375");
    expect(url).toContain("fit=crop");
  });

  it("returns null for missing input", () => {
    expect(walletStripImageUrl("", 750, 196)).toBeNull();
  });
});

describe("WALLET_STRIP_SIZES", () => {
  it("covers the standard Wallet strip scales", () => {
    expect(WALLET_STRIP_SIZES.map((size) => size.file)).toEqual([
      "strip.png",
      "strip@2x.png",
      "strip@3x.png",
    ]);
  });
});

describe("fetchImageBuffer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the buffer for a real image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => PNG_MAGIC.buffer,
      }),
    );
    const buffer = await fetchImageBuffer(
      "https://gwenda.co.uk/brand/wallet/icon.png",
    );
    expect(buffer).not.toBeNull();
  });

  it("rejects a SPA fallback page served with a 200 for a missing asset", async () => {
    const html = Buffer.from("<!DOCTYPE html><html>...</html>");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        arrayBuffer: async () => html.buffer,
      }),
    );
    const buffer = await fetchImageBuffer(
      "https://gwenda.co.uk/brand/wallet/icon.png",
    );
    expect(buffer).toBeNull();
  });

  it("rejects non-image bytes even without a content-type header", async () => {
    const html = Buffer.from("<!DOCTYPE html><html>...</html>");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: async () => html.buffer,
      }),
    );
    const buffer = await fetchImageBuffer(
      "https://gwenda.co.uk/brand/wallet/icon.png",
    );
    expect(buffer).toBeNull();
  });
});

describe("buildAppleWalletPass", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never hits the network for the bundled brand icon/logo — no self-fetch to our own origin", async () => {
    // The brand icon/logo used to be fetched over HTTP from our own /brand/wallet/*
    // path, which broke behind devcontainer tunnels and on undeployed assets (both
    // can return a 200 HTML fallback page instead of the image). They're now bundled
    // at build time, so this must never call fetch when there's no hero image to crop.
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      arrayBuffer: async () => Buffer.from("<!DOCTYPE html>").buffer,
    });
    vi.stubGlobal("fetch", fetchSpy);

    await buildAppleWalletPass(APPLE_WALLET_ENV, {
      ticketId: "test-ticket-1",
      title: "Launch Party",
      date: "2026-08-15",
      startTime: "17:00",
      endTime: "23:00",
      venue: "Schwartz Wharf",
      guestName: "Dan",
      guests: 1,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null instead of throwing when signing fails (e.g. bad certs)", async () => {
    const pass = await buildAppleWalletPass(APPLE_WALLET_ENV, {
      ticketId: "test-ticket-1",
      title: "Launch Party",
      date: "2026-08-15",
      startTime: "17:00",
      endTime: "23:00",
      venue: "Schwartz Wharf",
      guestName: "Dan",
      guests: 1,
    });

    expect(pass).toBeNull();
  });

  it("returns null when Apple Wallet env is not configured", async () => {
    const pass = await buildAppleWalletPass({}, { ticketId: "test-ticket-1" });
    expect(pass).toBeNull();
  });
});

describe("bundled wallet brand assets", () => {
  it("provides every brand file used by the pass as a valid PNG", async () => {
    const { WALLET_BRAND_ASSETS } =
      await import("./wallet-brand-assets.generated.js");
    const requiredFiles = [
      "logo.png",
      "logo@2x.png",
      "logo@3x.png",
      "icon.png",
      "icon@2x.png",
      "icon@3x.png",
      "strip-fallback.png",
      "strip-fallback@2x.png",
      "strip-fallback@3x.png",
    ];
    for (const file of requiredFiles) {
      expect(WALLET_BRAND_ASSETS[file], `missing ${file}`).toBeTruthy();
      const buffer = Buffer.from(WALLET_BRAND_ASSETS[file], "base64");
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);
    }
  });
});
