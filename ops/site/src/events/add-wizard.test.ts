import { describe, expect, it } from "vitest";
import { howOftenId, stepErrors, stepOfField, whenSentence, wizardSteps, wizardWhenErrors } from "./add-wizard";

const happyHour = {
	startsOn: "2026-10-21",
	endsOn: "",
	startTime: "17:00",
	endTime: "18:30",
	repeatUnit: "week",
	repeatEvery: "1",
	weekdays: ["sat", "wed", "thu", "fri"],
};

describe("Add wizard (#245)", () => {
	it("asks a night only what its series doesn't already say", () => {
		expect(wizardSteps("night")).toEqual(["kind", "when", "running", "guest", "picture", "notes", "check"]);
		expect(wizardSteps("series")).toEqual(["kind", "name", "when", "running", "about", "picture", "notes", "check"]);
	});

	it("blocks a step only on its own problems, and finds the step a problem belongs to", () => {
		const errors = { "event-name": "Add a name.", "event-starts": "Add the first night." };
		expect(stepErrors(errors, "when")).toEqual({ "event-starts": "Add the first night." });
		expect(stepErrors(errors, "picture")).toEqual({});
		expect(stepOfField("event-description", wizardSteps("once"))).toBe("about");
	});

	it("wants a start time, and a day for a weekly series", () => {
		expect(wizardWhenErrors({ ...happyHour, startTime: "", weekdays: [] }, "series")).toEqual({
			"event-start-time": "Add the time it starts.",
			"event-weekdays": "Pick at least one day.",
		});
		expect(wizardWhenErrors({ ...happyHour, startTime: "" }, "night")).toEqual({});
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
