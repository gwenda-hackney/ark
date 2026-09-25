import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  eventsAwaitingRelease,
  eventsNotStaged,
  seriesCount,
  type PublishWorkEvent,
} from "./event-publish-queue.ts";

function series(
  name: string,
  preview: PublishWorkEvent["publish"]["preview"],
  live: PublishWorkEvent["publish"]["live"],
): PublishWorkEvent {
  return { id: name, name, publish: { preview, live } };
}

const list = [
  series("new", "unpublished", "unpublished"),
  series("edited", "stale", "current"),
  series("staged", "current", "stale"),
  series("live", "current", "current"),
];

describe("event publish queue", () => {
  it("lists events staging does not have", () => {
    assert.deepEqual(eventsNotStaged(list).map((event) => event.id), ["new", "edited"]);
  });

  it("lists staged events waiting for a release", () => {
    assert.deepEqual(eventsAwaitingRelease(list).map((event) => event.id), ["staged"]);
  });

  it("counts series", () => {
    assert.equal(seriesCount(1), "1 series");
    assert.equal(seriesCount(3), "3 series");
  });
});
