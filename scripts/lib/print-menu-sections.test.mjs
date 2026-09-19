import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRINT_MENU_CHAPTERS,
  PRINT_MENU_SECTION_SLUGS,
  flattenPrintMenuSections,
} from "./print-menu-sections.mjs";

describe("print menu sections", () => {
  it("matches the guest print chapter tree", () => {
    assert.deepEqual(
      PRINT_MENU_CHAPTERS.map((chapter) => chapter.slug),
      ["our-formulas", "free-of-spirit", "by-the-book", "the-cabinet"],
    );
    assert.deepEqual(
      PRINT_MENU_CHAPTERS.find((chapter) => chapter.slug === "by-the-book")
        .subsections.map((sub) => sub.slug),
      ["spritz", "negroni", "sour", "highball", "bottled-beer", "draught-beer"],
    );
    assert.deepEqual(
      PRINT_MENU_CHAPTERS.find((chapter) => chapter.slug === "the-cabinet")
        .subsections.map((sub) => sub.slug),
      ["agave", "rum", "whiskey", "amaro-digestivi"],
    );
  });

  it("keeps draught beer under By the Book", () => {
    const draught = flattenPrintMenuSections().find(
      (section) => section.slug === "draught-beer",
    );
    assert.equal(draught?.title, "Draught Beer");
    assert.equal(draught?.parentSlug, "by-the-book");
    assert.equal(PRINT_MENU_SECTION_SLUGS.has("draught-beer"), true);
  });
});
