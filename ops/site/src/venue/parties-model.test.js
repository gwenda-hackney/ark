import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  INCLUDED_MAX_LENGTH,
  REPLY_MAX_LENGTH,
  assertValidParties,
  includedLines,
  isBlankParties,
  partyFacts,
  validateParties,
} from "./parties-model.js";

const BLANK = { standing: null, seated: null, included: "", replyWithin: "" };

describe("party facts", () => {
  it("blank is fine, and is blank", () => {
    assert.deepEqual(assertValidParties({}), BLANK);
    assert.deepEqual(assertValidParties({ standing: "", seated: "  ", included: "\n \n", replyWithin: " " }), BLANK);
    assert.equal(isBlankParties({}), true);
    assert.equal(isBlankParties({ replyWithin: "a day" }), false);
  });

  it("reads the figures and tidies the words", () => {
    assert.deepEqual(
      assertValidParties({
        standing: "80",
        seated: 40,
        included: "  No hire fee \r\n\nA booth   held for you\n",
        replyWithin: "  Within a day ",
      }),
      { standing: 80, seated: 40, included: "No hire fee\nA booth held for you", replyWithin: "a day" },
    );
    assert.deepEqual(includedLines(partyFacts({ included: "One\n\nTwo" })), ["One", "Two"]);
  });

  it("takes one capacity without the other", () => {
    assert.deepEqual(assertValidParties({ seated: "40" }), { ...BLANK, seated: 40 });
  });

  it("a capacity is a whole number above 0", () => {
    for (const value of ["0", "-5", "1.5", "lots", "1,000"]) {
      const { problems } = validateParties({ standing: value });
      assert.ok(problems.standing, `${value} should be refused`);
    }
    assert.match(validateParties({ seated: "0" }).problems.seated, /above 0/);
    assert.match(validateParties({ seated: "40ish" }).problems.seated, /whole number/);
  });

  it("keeps the words short", () => {
    assert.match(
      validateParties({ included: "x".repeat(INCLUDED_MAX_LENGTH + 1) }).problems.included,
      /under 300 characters \(it's 301\)/,
    );
    assert.match(validateParties({ included: "a\nb\nc\nd\ne\nf" }).problems.included, /5 lines/);
    assert.deepEqual(validateParties({ included: "a\nb\nc\nd\ne" }).problems, {});
    assert.ok(validateParties({ replyWithin: "x".repeat(REPLY_MAX_LENGTH + 1) }).problems.replyWithin);
  });

  it("refuses with a 400 that names each fact", () => {
    try {
      assertValidParties({ standing: "0", replyWithin: "x".repeat(50) });
      assert.fail("should throw");
    } catch (error) {
      assert.equal(error.status, 400);
      assert.deepEqual(Object.keys(error.problems), ["standing", "replyWithin"]);
      assert.match(error.message, /^Standing: Use a number above 0.* We reply within: Keep it to a few words/);
    }
  });
});
