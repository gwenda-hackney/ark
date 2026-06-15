import { describe, expect, it } from "vitest";
import { isPublicPath, matchesSecret } from "./site-auth.js";

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
