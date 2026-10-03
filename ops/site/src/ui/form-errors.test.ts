import { describe, expect, it, vi } from "vitest";
import {
	FormErrors,
	cleanErrors,
	errorCountLabel,
	firstErrorKey,
	revealFirstError,
} from "./form-errors.svelte";

describe("firstErrorKey", () => {
	it("goes to the earliest field on screen, not the first one found", () => {
		const map = { "event-end": "Use an end date.", "event-name": "Add a name." };
		expect(firstErrorKey(map, ["event-name", "event-start", "event-end"])).toBe("event-name");
	});

	it("falls back to the first set when the order doesn't know it", () => {
		expect(firstErrorKey({ b: "x", a: "y" }, ["c"])).toBe("b");
		expect(firstErrorKey({})).toBe("");
		expect(firstErrorKey({ a: "" })).toBe("");
	});
});

describe("revealFirstError", () => {
	it("switches to the tab holding the first problem, then focuses it", async () => {
		const calls: string[] = [];
		const el = {
			focus: vi.fn(() => calls.push("focus")),
			scrollIntoView: vi.fn(),
		} as unknown as HTMLElement;
		const key = await revealFirstError(
			{ "event-ends": "Add an end date.", "event-description": "Add a description." },
			{
				order: ["event-description", "event-ends"],
				tabOf: (k) => (k === "event-ends" ? "schedule" : "details"),
				currentTab: "schedule",
				showTab: (tab) => {
					calls.push(`tab:${tab}`);
				},
				find: (k) => (k === "event-description" ? el : null),
			},
		);
		expect(key).toBe("event-description");
		expect(calls).toEqual(["tab:details", "focus"]);
	});

	it("stays on the tab when the problem is already in view", async () => {
		const showTab = vi.fn();
		const el = { focus: vi.fn(), scrollIntoView: vi.fn() } as unknown as HTMLElement;
		await revealFirstError(
			{ "f-price": "Enter an amount in pounds, like 12.50." },
			{ tabOf: () => "details", currentTab: "details", showTab, find: () => el },
		);
		expect(showTab).not.toHaveBeenCalled();
		expect(el.focus).toHaveBeenCalled();
	});
});

describe("FormErrors", () => {
	it("holds messages per field, counts them and clears one as it's fixed", () => {
		const errors = new FormErrors();
		errors.replace({ a: "One.", b: "Two.", c: "" });
		expect(errors.count).toBe(2);
		expect(errors.get("a")).toBe("One.");
		errors.clear("a");
		expect(errors.get("a")).toBe("");
		expect(errors.count).toBe(1);
		errors.set("d", "Three.");
		expect(errors.first(["d", "b"])).toBe("d");
		errors.clearAll();
		expect(errors.count).toBe(0);
	});

	it("words the count for the action bar", () => {
		expect(errorCountLabel(0)).toBe("");
		expect(errorCountLabel(1)).toBe("1 thing to fix");
		expect(errorCountLabel(3)).toBe("3 things to fix");
		expect(cleanErrors({ a: "", b: "x" })).toEqual({ b: "x" });
	});
});
