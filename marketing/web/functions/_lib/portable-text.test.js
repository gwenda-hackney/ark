import { describe, expect, it } from "vitest";
import { portableTextToPlain } from "./portable-text.js";

describe("portableTextToPlain", () => {
  it("returns plain strings unchanged", () => {
    expect(portableTextToPlain("Hello")).toBe("Hello");
  });

  it("joins portable text blocks with blank lines", () => {
    const text = portableTextToPlain([
      {
        _type: "block",
        children: [{ _type: "span", text: "First paragraph." }],
      },
      {
        _type: "block",
        children: [{ _type: "span", text: "Second paragraph." }],
      },
    ]);
    expect(text).toBe("First paragraph.\n\nSecond paragraph.");
  });
});
