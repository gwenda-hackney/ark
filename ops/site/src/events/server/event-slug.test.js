import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { slugChangePlan } from "./event-store.js";

const jazz = { id: "1", slug: "jazz", formerSlugs: [] };
const rows = [
  { id: "1", Name: "Jazz", Slug: "jazz" },
  { id: "2", Name: "Negroni Hour", Slug: "negroni-hour", "Former slugs": "negroni-night" },
];

describe("changing a series' web address", () => {
  it("tidies what was typed and remembers the old address", () => {
    assert.deepEqual(slugChangePlan(jazz, "  Jazz & Soul ", rows), {
      slug: "jazz-and-soul",
      previous: "jazz",
      formerSlugs: ["jazz"],
      rows,
    });
  });

  it("does nothing when the address is the same", () => {
    assert.equal(slugChangePlan(jazz, "Jazz", rows), null);
  });

  it("going back to an old address takes it off the old list", () => {
    const moved = { ...jazz, slug: "jazz-and-soul", formerSlugs: ["jazz"] };
    assert.deepEqual(slugChangePlan(moved, "jazz", rows).formerSlugs, ["jazz-and-soul"]);
  });

  it("refuses an address another series has, or had", () => {
    assert.throws(() => slugChangePlan(jazz, "negroni-hour", rows), { status: 409 });
    assert.throws(() => slugChangePlan(jazz, "negroni-night", rows), /used that web address before/);
  });

  it("refuses an empty address and pages of the website's own", () => {
    assert.throws(() => slugChangePlan(jazz, "!!", rows), { status: 400 });
    assert.throws(() => slugChangePlan(jazz, "schedule", rows), { status: 409 });
  });
});
