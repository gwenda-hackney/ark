import { describe, expect, it } from "vitest";
import { HOME_STANDS, homeStandRow } from "./home-stands.js";

/** n cards in the order they next come round: "deal 1" runs first. */
const cards = (kind, n) =>
  Array.from({ length: n }, (_, i) => ({ title: `${kind} ${i + 1}` }));
const row = (deals, popups) =>
  homeStandRow([
    { id: "deals", cards: cards("deal", deals) },
    { id: "pop-up-kitchen", cards: cards("pop-up", popups) },
  ]);
/** What the row shows: each kind's titles, and how many more. */
const shape = ({ sections, compact }) => ({
  compact,
  columns: sections.map((section) => ({
    id: section.id,
    titles: section.cards.map((card) => card.title),
    more: section.more,
  })),
});

describe("homeStandRow", () => {
  it("shows at most three of each", () => {
    expect(HOME_STANDS).toBe(3);
  });

  it("one deal and one pop-up: side by side, as they are", () => {
    expect(shape(row(1, 1))).toEqual({
      compact: false,
      columns: [
        { id: "deals", titles: ["deal 1"], more: 0 },
        { id: "pop-up-kitchen", titles: ["pop-up 1"], more: 0 },
      ],
    });
  });

  it("a kind with none leaves the row to the other", () => {
    expect(shape(row(1, 0))).toEqual({
      compact: false,
      columns: [{ id: "deals", titles: ["deal 1"], more: 0 }],
    });
    expect(shape(row(0, 2)).columns.map((column) => column.id)).toEqual([
      "pop-up-kitchen",
    ]);
    expect(row(0, 0).sections).toEqual([]);
  });

  it.each([
    [2, 0],
    [2, 1],
    [3, 2],
  ])("%i deals and %i pop-ups: all of them, compact", (deals, popups) => {
    const { compact, columns } = shape(row(deals, popups));
    expect(compact).toBe(true);
    expect(columns.map((column) => column.titles.length)).toEqual(
      [deals, popups].filter(Boolean),
    );
    expect(columns.every((column) => column.more === 0)).toBe(true);
  });

  it("five deals: the next three running, and two more on What's on", () => {
    expect(shape(row(5, 2))).toEqual({
      compact: true,
      columns: [
        { id: "deals", titles: ["deal 1", "deal 2", "deal 3"], more: 2 },
        { id: "pop-up-kitchen", titles: ["pop-up 1", "pop-up 2"], more: 0 },
      ],
    });
    expect(shape(row(5, 0)).columns).toEqual([
      { id: "deals", titles: ["deal 1", "deal 2", "deal 3"], more: 2 },
    ]);
  });

  it("goes compact when only one kind has more than one", () => {
    expect(row(1, 2).compact).toBe(true);
    expect(row(1, 1).compact).toBe(false);
  });

  it("is empty for nothing", () => {
    expect(homeStandRow(undefined)).toEqual({ sections: [], compact: false });
  });
});
