import { describe, expect, it } from "vitest";
import { menuEditorActions, type MenuEditorInput } from "./editor-actions";

const saved: MenuEditorInput = {
	saved: true,
	named: true,
	canUndo: true,
	cocktail: true,
	hasIngredientLine: true,
	canRecalc: true,
	hasPhoto: true,
	busy: false,
};

describe("menuEditorActions", () => {
	it("enables everything on a saved cocktail with a photo", () => {
		const actions = menuEditorActions(saved);
		for (const action of Object.values(actions)) expect(action).toEqual({ disabled: false });
	});

	it("asks for a save first on a new drink", () => {
		const actions = menuEditorActions({ ...saved, saved: false, hasPhoto: false });
		expect(actions.print.reason).toBe("Save the drink first");
		expect(actions.reload.reason).toBe("Nothing saved to reload yet");
		expect(actions.takePhoto.reason).toBe("Save the drink first");
		expect(actions.removePhoto.reason).toBe("Save the drink first");
		expect(actions.delete.reason).toBe("Not saved yet");
	});

	it("keeps photo buttons in place when there is no photo", () => {
		const actions = menuEditorActions({ ...saved, hasPhoto: false });
		expect(actions.takePhoto.disabled).toBe(false);
		expect(actions.replacePhoto).toEqual({ disabled: true, reason: "No photo yet" });
		expect(actions.removePhoto).toEqual({ disabled: true, reason: "No photo yet" });
	});

	it("explains recipe-only buttons on other drinks", () => {
		const actions = menuEditorActions({ ...saved, cocktail: false });
		expect(actions.fromRecipe.reason).toBe("Only cocktails have a recipe");
		expect(actions.recalc.reason).toBe("Only cocktails have a recipe");
	});

	it("says what's missing for the recipe helpers", () => {
		const actions = menuEditorActions({ ...saved, hasIngredientLine: false, canRecalc: false });
		expect(actions.fromRecipe.reason).toBe("Add ingredients first");
		expect(actions.recalc.reason).toBe("Add ingredients with an ABV first");
	});

	it("covers undo and print", () => {
		expect(menuEditorActions({ ...saved, canUndo: false }).undo.reason).toBe("Nothing to undo");
		expect(menuEditorActions({ ...saved, named: false }).print.reason).toBe("Name the drink first");
	});
});
