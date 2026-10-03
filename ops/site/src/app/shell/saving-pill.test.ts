import { describe, expect, it } from "vitest";
import { savingPill } from "./saving-pill";

const idle = { stuck: 0, busy: 0, running: false, recentlyDone: false, dirty: false };

describe("savingPill", () => {
	it("says All saved just after the last job, when nothing is being edited", () => {
		expect(savingPill({ ...idle, recentlyDone: true })).toEqual({ tone: "done", label: "All saved" });
	});

	it("never says All saved while an editor has unsaved edits", () => {
		expect(savingPill({ ...idle, recentlyDone: true, dirty: true })).toEqual({
			tone: "unsaved",
			label: "Unsaved changes",
		});
	});

	it("puts problems and work in progress first", () => {
		expect(savingPill({ ...idle, stuck: 2, dirty: true }).label).toBe("2 need a look");
		expect(savingPill({ ...idle, busy: 3 }).label).toBe("Getting 3 ready…");
		expect(savingPill({ ...idle, running: true }).tone).toBe("busy");
	});

	it("stays hidden when there's nothing to say", () => {
		expect(savingPill(idle).tone).toBe("");
	});
});
