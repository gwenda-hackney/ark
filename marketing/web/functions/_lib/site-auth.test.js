import { describe, expect, it } from "vitest";
import {
  buildGateShareUrl,
  isAiReadingBot,
  isPublicPath,
  isUnauthenticatedCrawler,
  matchesSecret,
  resolveGate,
} from "./site-auth.js";

function req(userAgent) {
  return {
    headers: { get: (name) => (name === "User-Agent" ? userAgent : "") },
  };
}

describe("buildGateShareUrl", () => {
  it("adds the access param to the current path", () => {
    expect(
      buildGateShareUrl(
        "https://preview.gwenda-blue.pages.dev",
        "/whats-on",
        "secret-key",
      ),
    ).toBe("https://preview.gwenda-blue.pages.dev/whats-on?access=secret-key");
  });

  it("keeps existing query params and replaces access", () => {
    expect(
      buildGateShareUrl(
        "https://preview.gwenda-blue.pages.dev",
        "/events?x=1&access=old",
        "secret-key",
      ),
    ).toBe(
      "https://preview.gwenda-blue.pages.dev/events?x=1&access=secret-key",
    );
  });

  it("rejects open redirects", () => {
    expect(
      buildGateShareUrl(
        "https://preview.gwenda-blue.pages.dev",
        "//evil.example",
        "secret-key",
      ),
    ).toBe("https://preview.gwenda-blue.pages.dev/?access=secret-key");
  });
});

describe("isPublicPath", () => {
  it("allows stable brand assets through the preview gate", () => {
    expect(isPublicPath("/favicon.ico")).toBe(true);
    expect(isPublicPath("/health")).toBe(true);
    expect(isPublicPath("/health/")).toBe(true);
    expect(isPublicPath("/favicon.png")).toBe(true);
    expect(isPublicPath("/apple-touch-icon.png")).toBe(true);
    expect(isPublicPath("/brand/logo-organization.png")).toBe(true);
    expect(isPublicPath("/og/events/private-launch-party.jpg")).toBe(true);
  });

  it("allows invite pages, event RSVP pages, and RSVP API through the preview gate", () => {
    expect(isPublicPath("/invite/")).toBe(true);
    expect(isPublicPath("/invite/abc123")).toBe(true);
    expect(isPublicPath("/api/whats-on")).toBe(true);
    expect(isPublicPath("/api/featured-artist")).toBe(true);
    expect(isPublicPath("/whats-on")).toBe(true);
    expect(isPublicPath("/artists")).toBe(true);
    expect(isPublicPath("/artists/")).toBe(true);
    expect(isPublicPath("/artists/current")).toBe(true);
    expect(isPublicPath("/artists/rita-matos")).toBe(true);
    expect(isPublicPath("/whats-on/schedule")).toBe(true);
    expect(isPublicPath("/api/whats-on/schedule")).toBe(true);
    expect(isPublicPath("/whats-on/negroni-night")).toBe(true);
    expect(isPublicPath("/whats-on/negroni-night/2026-09-29")).toBe(true);
    expect(isPublicPath("/events/a1b2c3d4e5f6789012345678abcdef01")).toBe(true);
    expect(
      isPublicPath(
        "/events/a1b2c3d4e5f6789012345678abcdef01/b2c3d4e5f6789012345678abcdef0123",
      ),
    ).toBe(true);
    expect(isPublicPath("/api/rsvp")).toBe(true);
    expect(isPublicPath("/api/forms")).toBe(true);
    expect(isPublicPath("/api/forms/verify")).toBe(true);
    expect(isPublicPath("/api/forms/resend")).toBe(true);
    expect(isPublicPath("/contact/verify")).toBe(true);
    expect(isPublicPath("/forms/verify")).toBe(true);
    expect(isPublicPath("/contact/edit")).toBe(true);
    expect(isPublicPath("/forms/edit")).toBe(true);
    expect(isPublicPath("/api/events")).toBe(true);
    expect(isPublicPath("/api/ticket")).toBe(true);
    expect(isPublicPath("/api/ticket/pass")).toBe(true);
    expect(isPublicPath("/api/ticket/calendar")).toBe(true);
  });
});

describe("matchesSecret", () => {
  it("returns true for identical strings", () => {
    expect(matchesSecret("abc123", "abc123")).toBe(true);
  });

  it("returns false when lengths differ", () => {
    expect(matchesSecret("abc", "abcd")).toBe(false);
  });

  it("returns false when content differs", () => {
    expect(matchesSecret("abc123", "abc124")).toBe(false);
  });

  it("returns false for empty or missing values", () => {
    expect(matchesSecret("", "abc")).toBe(false);
    expect(matchesSecret("abc", "")).toBe(false);
    expect(matchesSecret(null, "abc")).toBe(false);
  });
});

describe("isAiReadingBot", () => {
  it("recognises common AI crawlers", () => {
    expect(isAiReadingBot(req("GPTBot/1.0"))).toBe(true);
    expect(
      isAiReadingBot(req("Mozilla/5.0 (compatible; Google-Extended)")),
    ).toBe(true);
    expect(isAiReadingBot(req("ClaudeBot/1.0"))).toBe(true);
  });

  it("ignores normal browsers", () => {
    expect(
      isAiReadingBot(
        req(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
        ),
      ),
    ).toBe(false);
  });
});

describe("isUnauthenticatedCrawler", () => {
  it("allows search and AI bots through the preview gate", () => {
    expect(
      isUnauthenticatedCrawler(req("Mozilla/5.0 (compatible; Googlebot/2.1)")),
    ).toBe(true);
    expect(isUnauthenticatedCrawler(req("GPTBot/1.0"))).toBe(true);
  });
});

describe("resolveGate", () => {
  it("leaves the live site open, password or not", () => {
    expect(resolveGate({ SITE_ENV: "production" })).toEqual({ kind: "open" });
    expect(resolveGate({ SITE_ENV: "production", SITE_PASSWORD: "pw" })).toEqual({ kind: "open" });
  });

  it("gates a preview even though it runs as production", () => {
    expect(resolveGate({ SITE_ENV: "production", SITE_PREVIEW: "true", SITE_PASSWORD: "pw" })).toEqual({
      kind: "gated",
      password: "pw",
    });
  });

  it("refuses a preview without a password rather than opening it", () => {
    expect(resolveGate({ SITE_ENV: "production", SITE_PREVIEW: "true" })).toEqual({ kind: "misconfigured" });
  });

  it("gates the dev website when it has a password", () => {
    expect(resolveGate({ SITE_ENV: "dev", SITE_PASSWORD: "pw" }).kind).toBe("gated");
  });
});
