import { describe, expect, it } from "vitest";
import {
  capacityLine,
  partyFactLines,
  partyOccasions,
  playKinds,
  readParties,
} from "./party-facts.js";

describe("playKinds", () => {
  const form = (options) => ({
    fields: [{ key: "name" }, { key: "whatYouDo", options }],
  });

  it("is the play form's what-you-do choices, without the catch-all", () => {
    expect(
      playKinds(
        form([
          { label: "DJ" },
          { label: " Live act " },
          { label: "Band" },
          { label: "Other" },
        ]),
      ),
    ).toEqual(["DJ", "Live act", "Band"]);
  });

  it("is empty without the form or the question", () => {
    expect(playKinds(null)).toEqual([]);
    expect(playKinds({ fields: [{ key: "name" }] })).toEqual([]);
  });
});

const texts = (raw) =>
  partyFactLines(readParties(raw)).map((line) => line.text);

describe("party facts", () => {
  it("all blank, or none published, says nothing", () => {
    expect(readParties(null)).toBeNull();
    expect(readParties(undefined)).toBeNull();
    expect(readParties({})).toBeNull();
    expect(
      readParties({ standing: null, included: " \n ", replyWithin: "  " }),
    ).toBeNull();
    expect(partyFactLines(null)).toEqual([]);
    expect(texts({})).toEqual([]);
  });

  it("every fact on its own line: how many fit, what's included, how soon we reply", () => {
    expect(
      partyFactLines(
        readParties({
          standing: 80,
          seated: 40,
          included: "No hire fee\nA booth held for you",
          replyWithin: "a day",
        }),
      ),
    ).toEqual([
      { kind: "capacity", text: "Up to 80 standing, 40 seated" },
      { kind: "included", text: "No hire fee" },
      { kind: "included", text: "A booth held for you" },
      { kind: "reply", text: "We reply within a day" },
    ]);
  });

  it("shows only what's filled in", () => {
    expect(texts({ replyWithin: "a day" })).toEqual(["We reply within a day"]);
    expect(texts({ included: "No hire fee" })).toEqual(["No hire fee"]);
    expect(texts({ seated: 40, replyWithin: "two days" })).toEqual([
      "Up to 40 seated",
      "We reply within two days",
    ]);
  });

  it("says the capacity it has: both, standing, or seated", () => {
    expect(capacityLine({ standing: 80, seated: 40 })).toBe(
      "Up to 80 standing, 40 seated",
    );
    expect(capacityLine({ standing: 80, seated: null })).toBe(
      "Up to 80 standing",
    );
    expect(capacityLine({ standing: null, seated: 40 })).toBe(
      "Up to 40 seated",
    );
    expect(capacityLine({ standing: null, seated: null })).toBe("");
  });

  it("leaves out what doesn't add up, never inventing a number", () => {
    expect(
      readParties({
        standing: 0,
        seated: 12.5,
        included: "A\r\n\r\n  B  ",
        replyWithin: 3,
      }),
    ).toEqual({
      standing: null,
      seated: null,
      included: ["A", "B"],
      replyWithin: "",
    });
    expect(readParties({ standing: "80" })).toBeNull();
  });
});

describe("partyOccasions", () => {
  /** The party form as the site reads it: its questions, a choice's words and value. */
  const form = (options) => ({
    fields: [
      { key: "name", label: "Name", options: null },
      { key: "occasion", label: "What’s the occasion?", options },
    ],
  });

  it("lists the form's kinds of party, in its order, by their words", () => {
    expect(
      partyOccasions(
        form([
          { label: "Birthday", value: "Birthday" },
          { label: "Leaving do", value: "Leaving do" },
          { label: "Work do", value: "Work do" },
          { label: "Something else", value: "Other" },
        ]),
      ),
    ).toEqual(["Birthday", "Leaving do", "Work do", "Something else"]);
  });

  it("is none without the form, the question or its choices", () => {
    expect(partyOccasions(null)).toEqual([]);
    expect(partyOccasions({ fields: [] })).toEqual([]);
    expect(partyOccasions(form(null))).toEqual([]);
    expect(
      partyOccasions(form([{ label: "  " }, { label: "Wedding " }])),
    ).toEqual(["Wedding"]);
  });
});
