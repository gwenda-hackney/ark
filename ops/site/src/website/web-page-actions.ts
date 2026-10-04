/**
 * The Website page's buttons stay on screen; these say when each one can be
 * used and, when it can't, why, in plain words for the tooltip.
 */
import { actionState, type ActionState } from "../ui/action-state";

type SiteLike = { known: boolean; items: unknown[]; updating: boolean; failed: boolean } | null;

/** "Update website now" (production) or "Update it now" (preview). */
export function updateNowAction(site: SiteLike, local: boolean, busy: boolean): ActionState {
	if (local) return actionState("Site builds only run in the real ops app");
	if (!site) return actionState("Checking the website…");
	if (site.updating) return actionState("It's updating now");
	if (!site.items.length && !site.failed && site.known) return actionState("Already up to date");
	return actionState(null, busy);
}

export function updateAllAction(count: number, busy: boolean): ActionState {
	return actionState(count ? null : "Nothing to put on the website", busy);
}

/** Try again on a background job that is still running or has failed. */
export function retryJobAction(state: "waiting" | "failed", busy: boolean): ActionState {
	return actionState(state === "failed" ? null : "Still getting it ready", busy);
}
