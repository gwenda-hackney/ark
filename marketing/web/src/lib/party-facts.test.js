import { describe, expect, it } from "vitest";
import { capacityLine, partyFactLines, readParties } from "./party-facts.js";

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
