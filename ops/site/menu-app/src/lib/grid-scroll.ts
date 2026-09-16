/**
 * Remember AG Grid vertical scroll across detail open/close.
 * While a key is parked, ignore resets to 0 from AG Grid body-scroll noise.
 */

const memory = new Map<string, number>();
const parked = new Set<string>();

export function rememberGridScroll(key: string, top: number) {
	if (!key || !Number.isFinite(top) || top < 0) return;
	if (parked.has(key) && top <= 0 && (memory.get(key) ?? 0) > 0) return;
	memory.set(key, top);
}

export function recalledGridScroll(key: string): number {
	return memory.get(key) ?? 0;
}

/** Snapshot current scroll and ignore later AG Grid zeroes until unpark. */
export function parkGridScroll(key: string, root?: ParentNode | null) {
	if (!key) return;
	const top = Math.max(recalledGridScroll(key), readGridViewportScroll(root));
	if (top > 0) memory.set(key, top);
	parked.add(key);
}

export function unparkGridScroll(key: string) {
	parked.delete(key);
}

export function scrollGridViewport(root: ParentNode | null | undefined, top: number) {
	if (!root || !Number.isFinite(top)) return;
	const nodes = root.querySelectorAll(
		".ag-body-viewport, .ag-center-cols-viewport, .ag-body-vertical-scroll-viewport",
	);
	for (const node of nodes) {
		(node as HTMLElement).scrollTop = top;
	}
}

export function readGridViewportScroll(root: ParentNode | null | undefined): number {
	if (!root) return 0;
	const nodes = root.querySelectorAll(
		".ag-body-viewport, .ag-center-cols-viewport, .ag-body-vertical-scroll-viewport",
	);
	let max = 0;
	for (const node of nodes) {
		max = Math.max(max, (node as HTMLElement).scrollTop || 0);
	}
	return max;
}

export function restoreGridScroll(
	root: ParentNode | null | undefined,
	key: string,
	attempts = [0, 16, 50, 120, 220, 400],
) {
	const top = recalledGridScroll(key);
	if (!root || top <= 0) {
		scrollGridViewport(root, top);
		return;
	}
	for (const delay of attempts) {
		if (delay === 0) {
			scrollGridViewport(root, top);
			continue;
		}
		window.setTimeout(() => scrollGridViewport(root, top), delay);
	}
}
