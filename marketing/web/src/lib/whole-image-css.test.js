import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// "Whole image" (#27) must win over every rule that crops the event hero, or
// the card shows cropped though ops says whole (Amo más on What's On).
const css = readFileSync(
  new URL("../styles/global.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** Top-level rules as { selector, body, index }, skipping @media blocks' own braces. */
function rules(source) {
  const found = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(source))) {
    const selector = match[1].trim().replace(/^@[^{]*$/, "");
    found.push({ selector, body: match[2], index: match.index });
  }
  return found;
}

/** Class and pseudo-class count (no ids or elements in these selectors). */
const specificity = (selector) =>
  (selector.match(/[.:][a-z-]+/gi) || []).filter((s) => s !== "::before")
    .length;

describe("whole image CSS", () => {
  const all = rules(css);
  const whole = all.find((rule) =>
    /event-media--whole \.event-hero$/.test(rule.selector),
  );

  it("has a rule that shows the hero uncropped", () => {
    expect(whole?.body).toMatch(/object-fit:\s*contain/);
  });

  it("is not overridden by a rule that crops the hero", () => {
    const croppers = all.flatMap((rule) =>
      /object-fit:\s*cover/.test(rule.body)
        ? rule.selector
            .split(",")
            .map((selector) => selector.trim())
            .filter((selector) => selector.endsWith(".event-hero"))
            .map((selector) => ({ selector, index: rule.index }))
        : [],
    );
    expect(croppers.length).toBeGreaterThan(0);
    const winners = croppers.filter(
      ({ selector, index }) =>
        specificity(selector) > specificity(whole.selector) ||
        (specificity(selector) === specificity(whole.selector) &&
          index > whole.index),
    );
    expect(winners.map((rule) => rule.selector)).toEqual([]);
  });
});
