import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	bulkPublishButtonLabel,
	bulkPublishLead,
	bulkPublishProgress,
	eventsNeedingLive,
	eventsNeedingPreview,
	liveWorkCopy,
	previewWorkCopy,
	type PublishWorkEvent,
} from "./event-publish-queue.ts";

function series(
	name: string,
	preview: PublishWorkEvent["publish"]["preview"],
	live: PublishWorkEvent["publish"]["live"],
	nights = 1,
): PublishWorkEvent {
	return {
		id: name,
		name,
		publish: {
			preview,
			live,
			previewDates: Array.from({ length: nights }, (_, index) => `2026-10-${index + 1}`),
		},
	};
}

describe("event publish queue", () => {
	const events = [
		series("Gwenda", "stale", "stale", 2),
		series("Chess", "unpublished", "unpublished", 0),
		series("Jazz", "current", "stale", 3),
		series("Open", "current", "current", 1),
	];

	it("counts series that still need a preview, then a live push", () => {
		assert.deepEqual(
			eventsNeedingPreview(events).map((event) => event.name),
			["Gwenda", "Chess"],
		);
		assert.deepEqual(
			eventsNeedingLive(events).map((event) => event.name),
			["Jazz"],
		);
	});

	it("labels the header from the current step", () => {
		assert.equal(bulkPublishButtonLabel(events), "Update preview (2)");
		assert.equal(
			bulkPublishButtonLabel(events.filter((event) => event.publish.preview === "current")),
			"Push live (1)",
		);
		assert.equal(
			bulkPublishButtonLabel([series("Open", "current", "current")]),
			"Publish",
		);
	});

	it("describes preview and live work with night counts", () => {
		assert.equal(previewWorkCopy(events), "2 series, 2 nights to write into the staging diary.");
		assert.equal(liveWorkCopy(events), "Unlocks after every preview is current.");
		const ready = events.filter((event) => event.publish.preview === "current");
		assert.equal(liveWorkCopy(ready), "1 series, 3 nights to copy onto the live site.");
		assert.equal(liveWorkCopy([series("Open", "current", "current")]), "Live on gwenda.co.uk.");
		assert.match(bulkPublishLead(events), /Step 1 of 3/);
		assert.match(bulkPublishLead(ready), /Open What's on/);
	});

	it("reports position inside a batch", () => {
		assert.equal(
			bulkPublishProgress("staging", 2, 5, "Gwenda"),
			"Updating preview: Gwenda. 2 of 5.",
		);
		assert.equal(
			bulkPublishProgress("production", 1, 1, "Jazz"),
			"Pushing live: Jazz. 1 of 1.",
		);
	});
});
