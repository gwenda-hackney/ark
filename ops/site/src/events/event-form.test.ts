import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { OpsEvent, OpsEventOccurrence } from "../app/api";
import { EventForm, lockedReadout, nightHasOwnCopy } from "./event-form.svelte";

function night(date: string, overrides: Partial<OpsEventOccurrence["overrides"]> = {}): OpsEventOccurrence {
	return {
		id: `n-${date}`,
		date,
		slug: `jazz-${date}`,
		sanityId: "",
		clickupTaskId: "",
		isSpecialEdition: false,
		overrides: {
			name: "",
			artist: "",
			offer: "",
			pageUrl: "",
			description: "",
			shortDescription: "",
			time: "",
			startTime: "",
			endTime: "",
			nightSchedule: null,
			operationsNotes: "",
			imageLinks: [],
			image: null,
			heroCrops: null,
			...overrides,
		},
	};
}

function series(fields: Partial<OpsEvent> = {}): OpsEvent {
	return {
		id: "ev1",
		name: "Jazz Night",
		artist: "House trio",
		offer: "£10 Negroni",
		pageUrl: "",
		description: "Live jazz every week.",
		shortDescription: "Live jazz.",
		nightSchedule: [],
		operationsNotes: "",
		imageLinks: [],
		startsOn: "2026-10-01",
		time: "",
		startTime: "19:00",
		endTime: "23:00",
		repeatEvery: 1,
		repeatUnit: "week",
		weekdays: ["thu"],
		monthDay: 0,
		endsOn: "2026-12-31",
		skippedDates: [],
		extraDates: [],
		slug: "jazz-night",
		replacesSeries: "",
		driveFolderId: "",
		driveFolderUrl: "",
		mainImage: null,
		heroCrops: null,
		images: [],
		dates: [],
		publish: { preview: "current", live: "current", nextDate: "", previewDates: [] },
		...fields,
	};
}

describe("EventForm: a series", () => {
	it("is clean right after filling, dirty once a field changes", () => {
		const event = series();
		const form = new EventForm();
		form.fill(event);
		assert.equal(form.isDirty(event), false);
		form.offer = "£12 Negroni";
		assert.equal(form.isDirty(event), true);
	});

	it("ignores whitespace and weekday order when comparing", () => {
		const event = series({ weekdays: ["thu", "fri"] });
		const form = new EventForm();
		form.fill(event);
		form.name = "  Jazz Night ";
		form.weekdays = ["fri", "thu"];
		assert.equal(form.isDirty(event), false);
	});

	it("saves trimmed fields, drops unlabelled slots, and keeps the free-text time only without start and end", () => {
		const event = series();
		const form = new EventForm();
		form.fill(event);
		form.name = " Jazz Night ";
		form.time = "late";
		form.nightSchedule = [
			{ label: " Open decks ", startTime: "20:00", endTime: "21:00" },
			{ label: "  ", startTime: "", endTime: "" },
		];
		const body = form.body(event);
		assert.equal(body.name, "Jazz Night");
		assert.deepEqual(body.nightSchedule, [{ label: "Open decks", startTime: "20:00", endTime: "21:00" }]);
		assert.equal(body.time, "");
		assert.equal("slug" in body, false);
		assert.equal("replacesSeries" in body, false);

		form.startTime = "";
		assert.equal(form.body(event).time, "late");
	});

	it("sends a new web address only when it changed, and counts it as unsaved", () => {
		const event = series();
		const form = new EventForm();
		form.fill(event);
		form.webAddress = "";
		assert.equal(form.webAddressChanged(event), false, "blank keeps the address");
		form.webAddress = "Jazz Nights";
		assert.equal(form.webAddressChanged(event), true);
		assert.equal(form.isDirty(event), true);
		assert.equal(form.body(event).slug, "Jazz Nights");
	});

	it("lists upcoming nights from the rule as typed", () => {
		const event = series({ skippedDates: ["2026-10-08"] });
		const form = new EventForm();
		form.fill(event);
		form.endsOn = "2026-10-22";
		assert.deepEqual(form.upcomingDates(event, "2026-10-02"), ["2026-10-15", "2026-10-22"]);
	});

	it("adds and removes night slots and toggles weekdays", () => {
		const form = new EventForm();
		form.addNightSlot();
		form.addNightSlot();
		form.nightSchedule[1].label = "Chess";
		form.removeNightSlot(0);
		assert.deepEqual(form.nightSchedule, [{ label: "Chess", startTime: "", endTime: "" }]);
		form.toggleWeekday("fri");
		form.toggleWeekday("sat");
		form.toggleWeekday("fri");
		assert.deepEqual(form.weekdays, ["sat"]);
	});
});

describe("EventForm: new events", () => {
	it("an empty new series or special event has nothing unsaved", () => {
		const form = new EventForm();
		form.reset("none");
		assert.equal(form.isDirty(null), false);
		form.reset("once");
		assert.equal(form.isDirty(null, { creatingOnce: true }), false);
		form.name = "Quiz";
		assert.equal(form.isDirty(null, { creatingOnce: true }), true);
	});

	it("a special event saves the series it replaces", () => {
		const form = new EventForm();
		form.reset("once");
		form.replacesSeries = "ev1";
		assert.equal(form.body(null).replacesSeries, "ev1");
	});
});

describe("EventForm: one night of a series", () => {
	it("starts locked on the series values when the night has no copy of its own", () => {
		const event = series({ dates: [night("2026-10-08")] });
		const form = new EventForm();
		form.fill(event, "2026-10-08");
		assert.equal(form.defaultsUnlocked, false);
		assert.equal(form.name, "Jazz Night");
		assert.equal(form.startsOn, "2026-10-08");
		assert.equal(form.shortDescription, "", "a night's card line never comes from the series");
		assert.equal(form.isDirty(event, { occurrenceDate: "2026-10-08" }), false);

		const body = form.occurrenceBody("this", event, {
			seriesId: "ev1",
			occurrenceDate: "2026-10-08",
			hasOwnPhoto: false,
		});
		assert.equal(body.name, "", "locked fields keep the series value");
		assert.equal(body.artist, "");
		assert.equal(body.startTime, "");
		assert.equal(body.date, "2026-10-08");
		assert.equal(body.seriesId, "ev1");
	});

	it("starts unlocked on a night with its own guest, and saves only what differs from the series", () => {
		const own = night("2026-10-08", { artist: "Guest quartet" });
		const event = series({ dates: [own] });
		assert.equal(nightHasOwnCopy(event, own), true);
		const form = new EventForm();
		form.fill(event, "2026-10-08");
		assert.equal(form.defaultsUnlocked, true);
		assert.equal(form.artist, "Guest quartet");
		form.offer = "£10 negroni";
		const body = form.occurrenceBody("this", event, {
			seriesId: "ev1",
			occurrenceDate: "2026-10-08",
			hasOwnPhoto: false,
		});
		assert.equal(body.artist, "Guest quartet");
		assert.equal(body.offer, "", "same as the series, ignoring case");
		assert.equal(body.heroCrops, null, "no crops without the night's own photo");
	});

	it("moving the night's date is an unsaved change", () => {
		const event = series({ dates: [night("2026-10-08")] });
		const form = new EventForm();
		form.fill(event, "2026-10-08");
		form.startsOn = "2026-10-09";
		assert.equal(form.isDirty(event, { occurrenceDate: "2026-10-08" }), true);
	});

	it("goes back to the series defaults", () => {
		const event = series({ dates: [night("2026-10-08", { artist: "Guest quartet", shortDescription: "Special" })] });
		const form = new EventForm();
		form.fill(event, "2026-10-08");
		form.useSeriesDefaults(event);
		assert.equal(form.defaultsUnlocked, false);
		assert.equal(form.artist, "House trio");
		assert.equal(form.shortDescription, "");
	});

	it("shows a locked field's series value, or says there is none", () => {
		const event = series({ pageUrl: "" });
		assert.equal(lockedReadout(event, "startTime"), "7pm");
		assert.equal(lockedReadout(event, "pageUrl"), "None on the series");
	});
});

describe("EventForm: nights listed on Schedule", () => {
	it("titles a night by its own name, else its date, with times, guest and offer below", () => {
		const titled = night("2026-10-08", { name: "Halloween special", artist: "DJ Pumpkin", offer: "Free punch" });
		const plain = night("2026-10-15");
		const event = series({ dates: [titled, plain] });
		const form = new EventForm();
		form.fill(event);
		assert.equal(form.nightHeadline(event, titled, titled.date), "Halloween special");
		assert.deepEqual(form.nightDetailLines(event, titled, titled.date), [
			"Thu 8 Oct",
			"7pm–11pm",
			"Guest · DJ Pumpkin",
			"Free punch",
		]);
		assert.deepEqual(form.nightDetailLines(event, plain, plain.date), ["7pm–11pm", "House trio"]);
	});

	it("stars only guest nights of an open series", () => {
		const special = { ...night("2026-10-08"), isSpecialEdition: true };
		const form = new EventForm();
		form.fill(series({ repeatUnit: "none", dates: [special] }));
		assert.equal(form.nightIsSpecialEvent(special), true);
		form.repeatUnit = "week";
		assert.equal(form.nightIsSpecialEvent(special), false);
	});
});
