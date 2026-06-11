import { describe, expect, it } from "vitest";
import { matchesSecret } from "./site-auth.js";

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
