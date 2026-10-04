/**
 * Which of the event editor's header buttons can be used right now, and why
 * not. The buttons are always on screen in the same order, so editors learn
 * where they are; one that can't be used is disabled with a reason instead
 * of disappearing and shifting the others along.
 */

import { actionState, type ActionState } from "../ui/action-state";

export type EditorHeaderInput = {
	/** The saved event's id; empty while new. */
	eventId: string;
	isNew: boolean;
	/** Editing or creating one night of a series. */
	editingNight: boolean;
	/** Creating or editing a special (one-night) event. */
	special: boolean;
	dirty: boolean;
	busy: boolean;
	/** The website already shows this exact version. */
	liveCurrent: boolean;
};

export type EditorHeaderActions = {
	addNight: ActionState;
	calendar: ActionState;
	website: ActionState;
	reload: ActionState;
};

export function editorHeaderActions(input: EditorHeaderInput): EditorHeaderActions {
	const saved = Boolean(input.eventId) && !input.isNew;
	const kind = input.editingNight ? "night" : input.special ? "event" : "series";
	const saveFirst = `Save the ${kind} first`;

	const addNight = input.editingNight
		? "Add nights from the series"
		: input.special
			? "A special event has one night"
			: !saved
				? saveFirst
				: null;

	const calendar = !saved
		? saveFirst
		: input.dirty
			? "Save your changes first"
			: null;

	const website = !saved
		? saveFirst
		: input.dirty
			? "Save your changes first"
			: input.liveCurrent
				? "Already on the website"
				: null;

	const reload = input.eventId ? null : "Nothing saved to reload yet";

	return {
		addNight: actionState(addNight, input.busy),
		calendar: actionState(calendar, input.busy),
		website: actionState(website, input.busy),
		reload: actionState(reload, input.busy),
	};
}
