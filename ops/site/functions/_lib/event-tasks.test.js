import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  memberIdByEmail,
  socialPostDueMs,
  socialTaskFields,
} from "./event-tasks.js";

describe("social tasks", () => {
  it("is due 14 days before the event, or today if that has passed", () => {
    const future = socialPostDueMs(
      "2026-10-20",
      new Date("2026-09-22T12:00:00Z"),
    );
    assert.equal(new Date(future).toISOString().slice(0, 10), "2026-10-06");
    const past = socialPostDueMs(
      "2026-09-24",
      new Date("2026-09-22T12:00:00Z"),
    );
    assert.equal(new Date(past).toISOString().slice(0, 10), "2026-09-22");
  });

  it("names the task and leaves it unassigned without an id", () => {
    const fields = socialTaskFields({
      name: "Jazz night",
      date: "2026-10-08",
      artist: "Ada",
      offer: "Guest menu",
      description: "Late jazz and soul.",
      imageUrl: "https://example.com/ada.jpg",
      assigneeId: null,
      now: new Date("2026-09-01T00:00:00Z"),
    });
    assert.equal(fields.name, "Send social post: Jazz night");
    assert.deepEqual(fields.assignees, []);
    assert.match(fields.description, /Ada/);
    assert.match(fields.description, /Guest menu/);
    assert.match(fields.description, /ada\.jpg/);
  });

  it("matches a ClickUp member by email", () => {
    const id = memberIdByEmail(
      {
        teams: [{ members: [{ user: { id: 7, email: "Ada@gwenda.co.uk" } }] }],
      },
      "ada@gwenda.co.uk",
    );
    assert.equal(id, 7);
    assert.equal(memberIdByEmail({ teams: [] }, "ada@gwenda.co.uk"), null);
  });
});
