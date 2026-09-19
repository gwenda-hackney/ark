import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiMessageText } from "./ai-text.js";

describe("aiMessageText", () => {
  it("reads OpenAI-style chat completions", () => {
    const text = aiMessageText({
      choices: [
        {
          message: {
            content: '{"summary":"Short sour.","concerns":[],"questions":[]}',
          },
        },
      ],
    });
    assert.match(text, /Short sour/);
  });

  it("reads Workers AI response strings", () => {
    assert.equal(aiMessageText({ response: "hello" }), "hello");
  });
});
