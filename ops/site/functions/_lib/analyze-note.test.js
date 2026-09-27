import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  parseStoredAnalyzeNote,
  serializeAnalyzeNote,
} from "./analyze-note.js";

describe("parseStoredAnalyzeNote", () => {
  it("reads a stored JSON blob", () => {
    const note = parseStoredAnalyzeNote(
      JSON.stringify({
        summary: "Cognac sour.",
        concerns: ["Short serve."],
        questions: ["Shake?"],
        specKey: "abc",
      }),
    );
    assert.deepEqual(note, {
      summary: "Cognac sour.",
      concerns: ["Short serve."],
      questions: ["Shake?"],
      specKey: "abc",
    });
  });

  it("returns null for an empty object", () => {
    assert.equal(parseStoredAnalyzeNote("{}"), null);
    assert.equal(parseStoredAnalyzeNote(""), null);
  });
});

describe("serializeAnalyzeNote", () => {
  it("round-trips a note", () => {
    const raw = {
      summary: "Cognac sour.",
      concerns: [],
      questions: [],
      specKey: "k1",
    };
    assert.deepEqual(parseStoredAnalyzeNote(serializeAnalyzeNote(raw)), raw);
  });
});
