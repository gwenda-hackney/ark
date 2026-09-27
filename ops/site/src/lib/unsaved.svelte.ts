/**
 * Unsaved editor guard. Detail forms register while they are dirty so Close,
 * crumbs, the rail, and browser back cannot drop work silently.
 */
import { navigationLeavesEditor } from "../../functions/_lib/spa-path.js";

export const unsaved = $state({
	dirty: false,
	allowLeave: false,
	onBlock: null as null | (() => void),
});

type BlockedNav = { path: string; replace?: boolean };

let blocked: BlockedNav | null = null;

export function setUnsavedGuard(dirty: boolean, onBlock?: () => void) {
	if (unsaved.allowLeave) return;
	unsaved.dirty = dirty;
	unsaved.onBlock = onBlock || null;
}

export function clearUnsavedGuard() {
	unsaved.dirty = false;
	unsaved.onBlock = null;
	unsaved.allowLeave = false;
	blocked = null;
}

export function shouldBlockNavigation(
	fromPath: string,
	toPath: string,
	force = false,
): boolean {
	if (force || unsaved.allowLeave || !unsaved.dirty) return false;
	return navigationLeavesEditor(fromPath, toPath);
}

export function rememberBlockedNav(path: string, replace = false) {
	blocked = { path, replace };
	unsaved.onBlock?.();
}

export function takeBlockedNav(): BlockedNav | null {
	const next = blocked;
	blocked = null;
	return next;
}

export function beginLeave() {
	unsaved.allowLeave = true;
	unsaved.dirty = false;
}
