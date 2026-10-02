import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { normalizeWebsite, parseProductUrl } from "./web-address.js";

describe("normalizeWebsite", () => {
  it("keeps a full URL and fills https for a bare host", () => {
    assert.equal(normalizeWebsite(""), "");
    assert.equal(
      normalizeWebsite("https://www.hillsprospect.com"),
      "https://www.hillsprospect.com",
    );
    assert.equal(
      normalizeWebsite("www.lwc-drinks.co.uk"),
      "https://www.lwc-drinks.co.uk",
    );
    assert.equal(normalizeWebsite("not a website"), "");
  });
});

describe("parseProductUrl", () => {
  it("takes one http(s) URL and nothing else", () => {
    assert.equal(parseProductUrl(" https://a.example/x "), "https://a.example/x");
    assert.equal(parseProductUrl("a.example"), "");
    assert.equal(parseProductUrl("https://a.example two"), "");
  });
});
