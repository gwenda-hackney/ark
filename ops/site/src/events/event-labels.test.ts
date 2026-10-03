import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { OpsEvent } from "../app/api";
import {
	deleteEventCopy,
	formatClock,
	repeatLabel,
	seriesBlurb,
	seriesGuestLabel,
	seriesTimeLabel,
	statusLabel,
	statusTone,
} from "./event-labels";

function event(overrides: Partial<OpsEvent> = {}): OpsEvent {
	return {
		publish: { preview: "current", live: "current", nextDate: "", previewDates: [] },
		dates: [],
		nightSchedule: [],
		...overrides,
	} as OpsEvent;
}

describe("event labels", () => {
	it("times read as a 12-hour clock, dropping :00", () => {
		assert.equal(formatClock("19:00"), "7pm");
		assert.equal(formatClock("00:30"), "12:30am");
		assert.equal(formatClock("12:00"), "12pm");
		assert.equal(formatClock("late"), "late");
		assert.equal(formatClock(""), "");
	});

	it("says how a series repeats", () => {
		assert.equal(repeatLabel({ repeatUnit: "week", repeatEvery: 1, weekdays: ["wed", "fri"] }), "Every week on Wed, Fri");
		assert.equal(repeatLabel({ repeatUnit: "week", repeatEvery: 2, weekdays: [] }), "Every 2 weeks");
		assert.equal(repeatLabel({ repeatUnit: "month", repeatEvery: 1, monthDay: 3 }), "Every month on 3");
		assert.equal(repeatLabel({ repeatUnit: "once" }), "Special event");
	});

	it("status follows the website: live, preview only, or not ready", () => {
		assert.equal(statusLabel(event()), "On website");
		assert.equal(statusTone(event()), "live");
		const previewOnly = event({ publish: { preview: "current", live: "stale", nextDate: "", previewDates: [] } });
		assert.equal(statusLabel(previewOnly), "Not on website yet");
		assert.equal(statusTone(previewOnly), "preview");
		assert.equal(statusTone(event({ publish: { preview: "stale", live: "current", nextDate: "", previewDates: [] } })), "unpublished");
		assert.equal(statusTone(null), "muted");
	});

	it("series cards: times, the next night's guest, and a blurb from the night slots", () => {
		assert.equal(seriesTimeLabel(event({ startTime: "19:00", endTime: "23:30" })), "7pm–11:30pm");
		assert.equal(seriesTimeLabel(event({ time: "Evening" })), "Evening");
		const withGuest = event({
			publish: { preview: "current", live: "current", nextDate: "2026-10-07", previewDates: [] },
			dates: [{ date: "2026-10-07", overrides: { artist: "DJ Vbrave" } } as OpsEvent["dates"][number]],
		});
		assert.equal(seriesGuestLabel(withGuest), "DJ Vbrave");
		assert.equal(
			seriesBlurb(event({ nightSchedule: [{ label: "Doors" }, { label: "Set" }] as OpsEvent["nightSchedule"] })),
			"Doors · Set",
		);
	});
});

describe("deleteEventCopy", () => {
	it("names just the night when deleting one night of an open series", () => {
		const copy = deleteEventCopy({
			kind: "night",
			eventName: "Gwenda Nights",
			nightDate: "2026-10-10",
			seriesName: "Gwenda Nights",
		});
		assert.equal(copy.title, "Delete the night of Sat 10 Oct?");
		assert.equal(copy.message, "Only this night goes. Gwenda Nights and its other nights stay. This can't be undone.");
		assert.ok(!copy.title.includes("event"));
	});

	it("says the whole series goes when deleting a series", () => {
		const copy = deleteEventCopy({ kind: "series", eventName: "Jazz Night" });
		assert.equal(copy.title, "Delete Jazz Night?");
		assert.equal(copy.message, "The series and all its nights go. This can't be undone.");
	});

	it("says it can be restored while it's still on the website", () => {
		const copy = deleteEventCopy({ kind: "event", eventName: "Halloween", onWebsite: true });
		assert.equal(copy.message, "It goes from the schedule.");
		assert.match(copy.website, /restore it there/);
	});
});
