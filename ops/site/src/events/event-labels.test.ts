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
	socialTaskNote,
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

describe("social post task line (#158)", () => {
	const night = (date: string, clickupTaskId = "") => ({ date, clickupTaskId }) as OpsEvent["dates"][number];
	it("says whether a night has its task, and counts them on a series", () => {
		const ev = event({ dates: [night("2026-10-01", "t0"), night("2026-10-08", "t1"), night("2026-10-15")] });
		assert.match(socialTaskNote(ev, "2026-10-08", "2026-10-02"), /^The social post task is in ClickUp/);
		assert.match(socialTaskNote(ev, "2026-10-15", "2026-10-02"), /^No social post task yet. Update website adds one/);
		assert.match(socialTaskNote(ev, "", "2026-10-02"), /^Social post tasks in ClickUp: 1 of 2 upcoming nights/);
		assert.equal(socialTaskNote(ev, "", "2026-12-01"), "No upcoming nights, so no social post tasks.");
	});
});

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

	it("status follows the website: on it, never on it, or waiting for Update website", () => {
		assert.equal(statusLabel(event()), "On website");
		assert.equal(statusTone(event()), "success");
		const changed = event({ publish: { preview: "current", live: "stale", nextDate: "", previewDates: [] } });
		assert.equal(statusLabel(changed), "Waiting for Update website");
		assert.equal(statusTone(changed), "warning");
		const fresh = event({ publish: { preview: "current", live: "unpublished", nextDate: "", previewDates: [] } });
		assert.equal(statusLabel(fresh), "Not on website");
		assert.equal(statusTone(fresh), "neutral");
		assert.equal(statusTone(null), "neutral");
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
