import { describe, expect, it } from "vitest";
import { EventForm } from "./event-form.svelte";
import {
	WIZARD_TYPES,
	categoryFor,
	howOftenId,
	kindForType,
	readyToSave,
	stepErrors,
	stepOfField,
	stepTitle,
	whenSentence,
	wizardErrors,
	wizardSteps,
	wizardType,
} from "./add-wizard";

const happyHour = {
	startsOn: "2026-10-21",
	endsOn: "",
	startTime: "17:00",
	endTime: "18:30",
	repeatUnit: "week",
	repeatEvery: "1",
	weekdays: ["sat", "wed", "thu", "fri"],
	artist: "",
	pageUrl: "",
	offer: "20% off all cocktails",
};

describe("Add wizard (#245)", () => {
	it("starts with what it is: a night, a deal, a pop-up kitchen or a special night in a series", () => {
		expect(WIZARD_TYPES.map((row) => row.title)).toEqual([
			"A night",
			"A deal",
			"A pop-up kitchen",
			"A special night in a series we run",
		]);
		expect(stepTitle("type", "event")).toBe("What are you adding?");
		for (const kind of ["once", "series", "night"] as const) expect(wizardSteps(kind, "event")[0]).toBe("type");
	});

	it("has nothing picked until they pick, except the series Add night came with", () => {
		expect(wizardType("series", "event", false)).toBe("");
		expect(wizardType("once", "popup", true)).toBe("popup");
		expect(wizardType("night", "event", false)).toBe("night");
		expect(wizardErrors(happyHour, "series", "", { noEnd: true })).toEqual({ "wizard-type": "Pick one." });
		expect(stepErrors({ "wizard-type": "Pick one." }, "type")).toEqual({ "wizard-type": "Pick one." });
	});

	it("starts a deal as repeating, a night or a pop-up kitchen as once", () => {
		expect(kindForType("event")).toBe("once");
		expect(kindForType("promotion")).toBe("series");
		expect(kindForType("popup")).toBe("once");
		expect(kindForType("night")).toBe("night");
	});

	it("asks a night only what its series doesn't already say", () => {
		expect(wizardSteps("night", "event")).toEqual(["type", "when", "running", "guest", "picture", "notes", "check"]);
		expect(wizardSteps("once", "event")).toEqual(["type", "name", "when", "running", "about", "picture", "notes", "check"]);
		expect(wizardSteps("series", "event")).toEqual(wizardSteps("once", "event"));
	});

	it("skips the running order for a deal or a pop-up kitchen, and for a special night of one", () => {
		expect(wizardSteps("series", "promotion")).toEqual(["type", "name", "when", "about", "picture", "notes", "check"]);
		expect(wizardSteps("once", "popup")).toEqual(["type", "name", "when", "about", "picture", "notes", "check"]);
		expect(wizardSteps("night", "promotion")).toEqual(["type", "when", "guest", "picture", "notes", "check"]);
	});

	it("gives a special night its series' type, and only asks a night for a guest", () => {
		expect(categoryFor("night", { category: "event" }, { category: "popup" })).toBe("popup");
		expect(categoryFor("night", { category: "popup" }, null)).toBe("event");
		expect(categoryFor("once", { category: "popup" }, { category: "promotion" })).toBe("popup");
		expect(stepTitle("guest", "event")).toBe("Anyone special?");
		expect(stepTitle("guest", "popup")).toBe("Anything different this time?");
		expect(stepTitle("guest", "promotion")).toBe("Anything different this time?");
	});

	it("blocks a step only on its own problems, and finds the step a problem belongs to", () => {
		const errors = { "event-name": "Add a name.", "event-starts": "Add the first night." };
		expect(stepErrors(errors, "when")).toEqual({ "event-starts": "Add the first night." });
		expect(stepErrors(errors, "picture")).toEqual({});
		expect(stepOfField("event-description", wizardSteps("once", "event"))).toBe("about");
		expect(stepOfField("event-offer", wizardSteps("series", "promotion"))).toBe("name");
		expect(stepOfField("event-end-time", wizardSteps("series", "promotion"))).toBe("when");
	});

	it("wants a start time, and a day for a weekly series", () => {
		expect(wizardErrors({ ...happyHour, startTime: "", weekdays: [] }, "series", "event", { noEnd: true })).toEqual({
			"event-start-time": "Add the time it starts.",
			"event-weekdays": "Pick at least one day.",
		});
		expect(wizardErrors({ ...happyHour, startTime: "" }, "night", "night", { noEnd: true })).toEqual({});
	});

	it("wants the deal, and when a deal ends, so the card can say 5pm–7pm", () => {
		const bare = { ...happyHour, offer: " ", endTime: "" };
		expect(wizardErrors(bare, "series", "promotion", { noEnd: true })).toEqual({
			"event-offer": "Add the deal.",
			"event-end-time": "Add the time it ends.",
		});
		expect(wizardErrors(bare, "once", "event", { noEnd: true })).toEqual({});
		expect(wizardErrors(bare, "once", "popup", { noEnd: true })).toEqual({});
		expect(wizardErrors(bare, "night", "night", { noEnd: true }), "a night keeps its series' deal").toEqual({});
	});

	it("wants the last date when they said it has one", () => {
		expect(wizardErrors(happyHour, "series", "popup", { noEnd: false })).toEqual({
			"event-ends": "Add the last date, or pick No end date.",
		});
		expect(wizardErrors({ ...happyHour, endsOn: "2026-10-25" }, "series", "popup", { noEnd: false })).toEqual({});
		expect(wizardErrors(happyHour, "once", "popup", { noEnd: false }), "once has no last date").toEqual({});
	});

	it("doesn't save what the type doesn't ask for, so a guest typed before picking Pop-up stays off", () => {
		const form = new EventForm();
		form.artist = "DJ Shadow";
		form.pageUrl = "@chezpickle";
		form.offer = "£10 Negroni";
		form.nightSchedule = [{ label: "Doors", startTime: "19:00", endTime: "" }];
		readyToSave(form, { kind: "once", category: "popup", ownPhoto: false });
		expect([form.artist, form.pageUrl, form.offer, form.nightSchedule]).toEqual(["", "@chezpickle", "", []]);
		expect(form.defaultsUnlocked).toBe(false);

		const night = new EventForm();
		night.artist = "DJ Shadow";
		night.offer = "Two for one";
		readyToSave(night, { kind: "night", category: "promotion", ownPhoto: true });
		expect([night.artist, night.offer]).toEqual(["", "Two for one"]);
		expect(night.defaultsUnlocked).toBe(true);
		expect(night.ownPhoto).toBe(true);
	});

	it("says when, in plain words", () => {
		expect(whenSentence(happyHour, "series")).toBe(
			"Every week on Wed, Thu, Fri and Sat, 5pm–6:30pm, from Wed 21 Oct, no end date",
		);
		expect(whenSentence({ ...happyHour, repeatUnit: "month", weekdays: [], endsOn: "2026-12-31" }, "series")).toMatch(
			/^Every month, 5pm–6:30pm, from Wed 21 Oct, until Thu 31 Dec$/,
		);
		expect(whenSentence({ ...happyHour, repeatUnit: "once", startTime: "20:00", endTime: "" }, "once")).toBe(
			"Wed 21 Oct, from 8pm",
		);
		expect(howOftenId("week", "2")).toBe("week-2");
	});
});
