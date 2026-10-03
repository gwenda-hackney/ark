import { describe, expect, it } from "vitest";
import { editorHeaderActions, type EditorHeaderInput } from "./editor-header-actions";

const series: EditorHeaderInput = {
	eventId: "12",
	isNew: false,
	editingNight: false,
	special: false,
	dirty: false,
	busy: false,
	liveCurrent: false,
};

describe("editorHeaderActions", () => {
	it("enables everything on a saved series with changes waiting", () => {
		const actions = editorHeaderActions(series);
		expect(actions.addNight).toEqual({ disabled: false });
		expect(actions.calendar).toEqual({ disabled: false });
		expect(actions.website).toEqual({ disabled: false });
		expect(actions.reload).toEqual({ disabled: false });
	});

	it("asks for a save first on a new series", () => {
		const actions = editorHeaderActions({ ...series, eventId: "", isNew: true });
		expect(actions.addNight).toEqual({ disabled: true, reason: "Save the series first" });
		expect(actions.calendar.reason).toBe("Save the series first");
		expect(actions.website.reason).toBe("Save the series first");
		expect(actions.reload.reason).toBe("Nothing saved to reload yet");
	});

	it("explains why a night or special event has no Add night", () => {
		expect(editorHeaderActions({ ...series, editingNight: true }).addNight.reason).toBe(
			"Add nights from the series",
		);
		expect(editorHeaderActions({ ...series, special: true }).addNight.reason).toBe(
			"A special event has one night",
		);
	});

	it("names the kind of record in Save first", () => {
		const night = editorHeaderActions({ ...series, isNew: true, editingNight: true });
		expect(night.website.reason).toBe("Save the night first");
		const special = editorHeaderActions({ ...series, eventId: "", isNew: true, special: true });
		expect(special.calendar.reason).toBe("Save the event first");
	});

	it("waits for unsaved changes before the calendar and website", () => {
		const actions = editorHeaderActions({ ...series, dirty: true });
		expect(actions.calendar.reason).toBe("Save your changes first");
		expect(actions.website.reason).toBe("Save your changes first");
		expect(actions.addNight.disabled).toBe(false);
	});

	it("keeps Update website in place, disabled, when the website is current", () => {
		expect(editorHeaderActions({ ...series, liveCurrent: true }).website).toEqual({
			disabled: true,
			reason: "Already on the website",
		});
	});

	it("disables without a reason while busy", () => {
		const actions = editorHeaderActions({ ...series, busy: true });
		expect(actions.website).toEqual({ disabled: true });
		expect(actions.addNight).toEqual({ disabled: true });
	});
});
