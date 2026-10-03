import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { OpsEvent } from "../app/api";
import { seriesCardRow } from "./series-card";

function event(overrides: Partial<OpsEvent> = {}): OpsEvent {
	return {
		id: "ev1",
		name: "Negroni Chess Society",
		repeatUnit: "week",
		repeatEvery: 1,
		weekdays: ["tue"],
		startTime: "16:00",
		endTime: "23:00",
		publish: { preview: "current", live: "current", nextDate: "", previewDates: [] },
		dates: [],
		nightSchedule: [],
		...overrides,
	} as OpsEvent;
}

describe("series card", () => {
	it("maps photo, name, cadence, time and website status", () => {
		const row = seriesCardRow(event({ mainImage: { url: "https://cdn.sanity.io/a.jpg" } as OpsEvent["mainImage"] }));
		assert.equal(row.id, "ev1");
		assert.equal(row.href, "/events/ev1");
		assert.equal(row.name, "Negroni Chess Society");
		assert.equal(row.photo, "https://cdn.sanity.io/a.jpg");
		assert.equal(row.when, "Tuesday");
		assert.equal(row.cadence, "Every week on Tue");
		assert.equal(row.time, "4pm–11pm");
		assert.equal(row.status, "Live");
		assert.equal(row.tone, "success");
	});

	it("says when there is no next night and the website is behind", () => {
		const row = seriesCardRow(
			event({ publish: { preview: "current", live: "stale", nextDate: "", previewDates: [] } }),
		);
		assert.equal(row.next, "No nights");
		assert.equal(row.photo, "");
		assert.equal(row.status, "Changed");
		assert.equal(row.tone, "warning");
	});
});
