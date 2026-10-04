import { describe, expect, it } from "vitest";
import { menuEditorActions, metricActions, type MenuEditorInput } from "./editor-actions";

const saved: MenuEditorInput = {
	saved: true,
	named: true,
	canUndo: true,
	cocktail: true,
	hasIngredientLine: true,
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
	});

	it("says what's missing for the recipe helpers", () => {
		const actions = menuEditorActions({ ...saved, hasIngredientLine: false });
		expect(actions.fromRecipe.reason).toBe("Add ingredients first");
	});

	it("covers undo and print", () => {
		expect(menuEditorActions({ ...saved, canUndo: false }).undo.reason).toBe("Nothing to undo");
		expect(menuEditorActions({ ...saved, named: false }).print.reason).toBe("Name the drink first");
	});
});

describe("metricActions", () => {
	const locked = { cocktail: true, overridden: false, hasRecipeValue: true };

	it("offers Override on a locked field and says it already follows the recipe", () => {
		const actions = metricActions(locked);
		expect(actions.override).toEqual({ disabled: false });
		expect(actions.useRecipe).toEqual({ disabled: true, reason: "Already the recipe value" });
	});

	it("offers Use recipe value once set by hand", () => {
		const actions = metricActions({ ...locked, overridden: true });
		expect(actions.override).toEqual({ disabled: true, reason: "Already set by hand" });
		expect(actions.useRecipe).toEqual({ disabled: false });
	});

	it("can override a cocktail with no recipe figure, but not go back to one", () => {
		expect(metricActions({ ...locked, hasRecipeValue: false }).override.disabled).toBe(false);
		expect(metricActions({ ...locked, overridden: true, hasRecipeValue: false }).useRecipe).toEqual({
			disabled: true,
			reason: "Add ingredients with amounts first",
		});
	});

	it("keeps both buttons, disabled, on drinks without a recipe", () => {
		const actions = metricActions({ cocktail: false, overridden: true, hasRecipeValue: false });
		expect(actions.override.reason).toBe("Only cocktails work this out from a recipe");
		expect(actions.useRecipe.reason).toBe("Only cocktails work this out from a recipe");
	});
});
