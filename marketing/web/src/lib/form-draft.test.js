import { describe, expect, it } from "vitest";
import { formDraftKey, seedFormDraft, slugFromToken } from "./form-draft.js";

/** A link's token: base64url JSON, a dot, a signature. */
function token(payload) {
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.signature`;
}

function memoryStorage() {
  const items = new Map();
  return {
    items,
    setItem: (key, value) => items.set(key, value),
    getItem: (key) => items.get(key) ?? null,
  };
}

describe("formDraftKey", () => {
  it("names a form's place in the tab", () => {
    expect(formDraftKey("play")).toBe("gwenda-form:play");
    expect(formDraftKey("")).toBe("");
  });
});

describe("slugFromToken", () => {
  it("reads the form from the token", () => {
    expect(slugFromToken(token({ slug: "party", rowId: 4 }))).toBe("party");
  });

  it("is empty for a token that isn't one, or names no form", () => {
    expect(slugFromToken("")).toBe("");
    expect(slugFromToken(null)).toBe("");
    expect(slugFromToken("not base64 json")).toBe("");
    expect(slugFromToken(token({ rowId: 4 }))).toBe("");
    expect(slugFromToken(token({ slug: "../admin" }))).toBe("");
  });
});

describe("seedFormDraft", () => {
  it("puts the answers back for the form to open with", () => {
    const storage = memoryStorage();
    seedFormDraft("/contact/play", { name: "Ada" }, storage);
    const saved = JSON.parse(storage.getItem("gwenda-form:play"));
    expect(saved).toMatchObject({
      answers: { name: "Ada" },
      pending: null,
      result: null,
    });
    expect(saved.savedAt).toEqual(expect.any(Number));
  });

  it("does nothing without a form or answers", () => {
    const storage = memoryStorage();
    seedFormDraft("", { name: "Ada" }, storage);
    seedFormDraft("/elsewhere", { name: "Ada" }, storage);
    seedFormDraft("/contact/play", undefined, storage);
    expect(storage.items.size).toBe(0);
  });

  it("leaves the form empty when the tab's storage is shut", () => {
    const storage = {
      setItem() {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() =>
      seedFormDraft("/contact/play", { name: "Ada" }, storage),
    ).not.toThrow();
  });
});
