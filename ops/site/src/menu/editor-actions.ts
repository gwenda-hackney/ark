/**
 * Which of the menu item editor's buttons can be used right now, and why
 * not. Buttons stay in place and are disabled with a reason instead of
 * coming and going, so the row never shifts under the editor's hand.
 */
import { actionState, type ActionState } from "../ui/action-state";

export type MenuEditorInput = {
	/** Saved at least once (has an id). */
	saved: boolean;
	named: boolean;
	canUndo: boolean;
	/** Cocktails have a recipe; beers, wines and spirits don't. */
	cocktail: boolean;
	/** The recipe has ingredients that read as a menu line. */
	hasIngredientLine: boolean;
	/** ABV and volume can be worked out from the recipe. */
	canRecalc: boolean;
	hasPhoto: boolean;
	busy: boolean;
};

export type MenuEditorActions = {
	print: ActionState;
	undo: ActionState;
	reload: ActionState;
	fromRecipe: ActionState;
	recalc: ActionState;
	takePhoto: ActionState;
	replacePhoto: ActionState;
	removePhoto: ActionState;
	delete: ActionState;
};

export function menuEditorActions(input: MenuEditorInput): MenuEditorActions {
	const saveFirst = input.saved ? null : "Save the drink first";
	const recipeOnly = input.cocktail ? null : "Only cocktails have a recipe";
	const photo = saveFirst ?? (input.hasPhoto ? null : "No photo yet");
	return {
		print: actionState(saveFirst ?? (input.named ? null : "Name the drink first"), input.busy),
		undo: actionState(input.canUndo ? null : "Nothing to undo", input.busy),
		reload: actionState(input.saved ? null : "Nothing saved to reload yet", input.busy),
		fromRecipe: actionState(recipeOnly ?? (input.hasIngredientLine ? null : "Add ingredients first"), false),
		recalc: actionState(recipeOnly ?? (input.canRecalc ? null : "Add ingredients with an ABV first"), false),
		takePhoto: actionState(saveFirst, input.busy),
		replacePhoto: actionState(photo, input.busy),
		removePhoto: actionState(photo, input.busy),
		delete: actionState(input.saved ? null : "Not saved yet", input.busy),
	};
}
