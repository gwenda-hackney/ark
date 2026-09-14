import { describe, expect, it } from "vitest";
import { nestMenuSections } from "./menu";

describe("nestMenuSections", () => {
  it("nests subsections under chapters", () => {
    const nested = nestMenuSections([
      { id: "by-the-book", title: "By the Book", items: [] },
      { id: "spritz", title: "Spritz", items: [], parentId: "by-the-book" },
    ]);
    expect(nested).toHaveLength(1);
    expect(nested[0].subsections?.[0].id).toBe("spritz");
  });
});
