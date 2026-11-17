import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { OpsEvent } from "../app/api";
import {
	LIST_COPY,
	SCHEDULE_KINDS,
	eventPath,
	homeList,
	sectionCategory,
	sectionEvents,
	sectionOf,
} from "./event-lists";

function event(fields: Partial<OpsEvent>): OpsEvent {
	return {
		id: "1",
		name: "",
		repeatUnit: "week",
		repeatEvery: 1,
		weekdays: [],
		startsOn: "",
		dates: [],
		publish: { preview: "current", live: "current", nextDate: "", previewDates: [] },
		...fields,
	} as OpsEvent;
}

const events = [
	event({ id: "1", name: "Wednesday Jazz", weekdays: ["wed"] }),
	event({ id: "2", name: "Negroni Society", weekdays: ["tue"], category: "event" }),
	event({ id: "3", name: "Halloween", repeatUnit: "once", startsOn: "2026-10-31" }),
	event({ id: "4", name: "Andy Caruso", repeatUnit: "once", startsOn: "2026-11-20" }),
	event({ id: "5", name: "Fat Hom", repeatUnit: "once", startsOn: "2026-11-14" }),
	event({ id: "6", name: "Chez Pickle", weekdays: ["thu"], category: "popup" }),
	event({ id: "7", name: "Dumpling Night", repeatUnit: "once", startsOn: "2026-12-01", category: "popup" }),
	event({ id: "8", name: "Cocktail Hour", weekdays: ["fri"], category: "promotion" }),
];

const TODAY = "2026-11-12";
const names = (section: "events" | "popups" | "deals", today = TODAY) =>
	sectionEvents(events, section, today).map((row) => row.name);

describe("What's on's lists (#312)", () => {
	it("each holds one kind: series by weekday, then one-offs still to come by date", () => {
		assert.deepEqual(names("events"), ["Negroni Society", "Wednesday Jazz", "Fat Hom", "Andy Caruso"]);
		assert.deepEqual(names("popups"), ["Chez Pickle", "Dumpling Night"]);
		assert.deepEqual(names("deals"), ["Cocktail Hour"]);
	});

	it("drops a one-off once its day has gone, and keeps one without a date yet", () => {
		assert.ok(!names("events").includes("Halloween"));
		assert.ok(names("events", "2026-10-31").includes("Halloween"), "on the day itself it's still there");
		const undated = [event({ id: "9", name: "To be booked", repeatUnit: "once" })];
		assert.deepEqual(
			sectionEvents(undated, "events", TODAY).map((row) => row.name),
			["To be booked"],
		);
	});

	it("opens each at its kind's address; a night stays on the Schedule's", () => {
		assert.equal(eventPath(events[0]), "/events/1");
		assert.equal(eventPath(events[5], "gallery"), "/popups/6/gallery");
		assert.equal(eventPath(events[7]), "/deals/8");
		assert.equal(eventPath({ id: "6@2026-11-20", category: "popup" }), "/events/6@2026-11-20");
		assert.equal(sectionOf({ category: "party" }), "events", "an unknown kind is a night");
		assert.equal(sectionCategory("popups"), "popup");
		assert.equal(sectionCategory("schedule"), null);
	});

	it("names the lists as the menu does, and the Schedule's filter too", () => {
		assert.deepEqual(
			(["schedule", "events", "popups", "deals"] as const).map((list) => LIST_COPY[list].title),
			["Schedule", "Events", "Pop-ups", "Deals"],
		);
		assert.deepEqual(
			SCHEDULE_KINDS.map((kind) => kind.label),
			["All", "Events", "Pop-ups", "Deals"],
		);
	});

	it("keeps the list it came from under an editor, else a night's Schedule or its kind's list", () => {
		const home = (fields: Partial<Parameters<typeof homeList>[0]>) =>
			homeList({ origin: null, night: false, scheduleAdd: false, section: "events", ...fields });
		assert.equal(home({ origin: "deals", night: true }), "deals");
		assert.equal(home({ night: true, section: "popups" }), "schedule");
		assert.equal(home({ scheduleAdd: true }), "schedule");
		assert.equal(home({ section: "popups" }), "popups");
	});
});
