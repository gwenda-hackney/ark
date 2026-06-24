import { describe, expect, it } from "vitest";
import {
  isAiReadingBot,
  isPublicPath,
  isUnauthenticatedCrawler,
  matchesSecret,
} from "./site-auth.js";

function req(userAgent) {
  return { headers: { get: (name) => (name === "User-Agent" ? userAgent : "") } };
}

describe("isPublicPath", () => {
  it("allows stable brand assets through the staging gate", () => {
    expect(isPublicPath("/favicon.ico")).toBe(true);
    expect(isPublicPath("/favicon.png")).toBe(true);
    expect(isPublicPath("/apple-touch-icon.png")).toBe(true);
    expect(isPublicPath("/brand/logo-organization.png")).toBe(true);
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
    expect(isAiReadingBot(req("Mozilla/5.0 (compatible; Google-Extended)"))).toBe(
      true,
    );
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
  it("allows search and AI bots through the staging gate", () => {
    expect(isUnauthenticatedCrawler(req("Mozilla/5.0 (compatible; Googlebot/2.1)"))).toBe(
      true,
    );
    expect(isUnauthenticatedCrawler(req("GPTBot/1.0"))).toBe(true);
  });
});
