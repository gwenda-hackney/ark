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
	hasPhoto: boolean;
	busy: boolean;
};

export type MenuEditorActions = {
	print: ActionState;
	undo: ActionState;
	reload: ActionState;
	fromRecipe: ActionState;
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
		takePhoto: actionState(saveFirst, input.busy),
		replacePhoto: actionState(photo, input.busy),
		removePhoto: actionState(photo, input.busy),
		delete: actionState(input.saved ? null : "Not saved yet", input.busy),
	};
}

export type MetricInput = {
	/** Cocktails work ABV and volume out from the recipe; other drinks type them. */
	cocktail: boolean;
	/** Set by hand (metric-override.js). */
	overridden: boolean;
	/** The recipe can work this figure out. */
	hasRecipeValue: boolean;
};

export type MetricActions = {
	/** Unlock the field to type over the recipe's figure. */
	override: ActionState;
	/** Lock it again on the recipe's figure. */
	useRecipe: ActionState;
};

/** The Override and Use recipe value buttons beside ABV or Volume. */
export function metricActions(input: MetricInput): MetricActions {
	const recipeOnly = input.cocktail ? null : "Only cocktails work this out from a recipe";
	return {
		override: actionState(recipeOnly ?? (input.overridden ? "Already set by hand" : null)),
		useRecipe: actionState(
			recipeOnly ??
				(!input.overridden
					? "Already the recipe value"
					: input.hasRecipeValue
						? null
						: "Add ingredients with amounts first"),
		),
	};
}
