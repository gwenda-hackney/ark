/**
 * A button that can't be used stays on screen, disabled, with the reason as
 * its tooltip (Button's `reason`). Pages work out these states in small pure
 * helpers so the rules can be tested without rendering.
 */
export type ActionState = { disabled: boolean; reason?: string };

/** Disabled with `reason` when there is one; otherwise just while busy. */
export function actionState(reason: string | null | undefined, busy = false): ActionState {
	if (reason) return { disabled: true, reason };
	return { disabled: busy };
}
