/**
 * Dragging a section by its handle on a menu's page, with a mouse or a
 * finger (pointer events, so phones work too, unlike HTML drag and drop).
 * While it moves, `onover` says where it would land: the index among its
 * siblings it would go before (the count for "at the end"). On release,
 * `ondrop` gets the siblings' ids in their new order, or nothing happens
 * when it lands where it was. The page scrolls when the finger nears its
 * top or bottom edge.
 */
import { moveId } from "./menu-sections.js";

type Rect = { top: number; bottom: number };

/**
 * Where a pointer at height `y` would put a section among siblings stacked
 * in one column (`rects`, in order): before the first one it is above, or
 * over the upper half of. The page lays sections in one column at every
 * width, so only the height counts.
 */
export function dropIndex(y: number, rects: Rect[]): number {
	for (const [index, rect] of rects.entries()) {
		if (y < (rect.top + rect.bottom) / 2) return index;
	}
	return rects.length;
}

/** The siblings' order after dropping the one at `from` before index `at` (dropIndex). */
export function orderAfterDrop(ids: string[], from: number, at: number): string[] {
	return moveId(ids, from, at > from ? at - 1 : at);
}

function scroller(element: HTMLElement): HTMLElement | null {
	for (let node = element.parentElement; node; node = node.parentElement) {
		const style = getComputedStyle(node);
		if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
	}
	return null;
}

/**
 * A lifted copy of the section under the pointer while it's dragged, so it's
 * plain what is moving: the section's top, at its own width, tilted a touch.
 */
function liftedCopy(section: HTMLElement, x: number, y: number) {
	const box = section.getBoundingClientRect();
	const ghost = section.cloneNode(true) as HTMLElement;
	ghost.removeAttribute("data-section");
	ghost.classList.remove("dragged", "drop-before", "drop-after");
	ghost.setAttribute("aria-hidden", "true");
	const offsetX = x - box.left;
	const offsetY = Math.min(y - box.top, 40);
	Object.assign(ghost.style, {
		position: "fixed",
		left: "0",
		top: "0",
		width: `${box.width}px`,
		maxHeight: "9rem",
		overflow: "hidden",
		margin: "0",
		zIndex: "1000",
		pointerEvents: "none",
		opacity: "1",
		borderRadius: "var(--radius-lg)",
		// Solid, like a popover, so the page doesn't show through
		background: "var(--popover, #1a1a1d)",
		color: getComputedStyle(section).color,
		outline: "1px solid var(--primary)",
		boxShadow: "0 18px 40px rgb(0 0 0 / 0.45)",
		willChange: "transform",
	});
	document.body.append(ghost);
	const at = (px: number, py: number) => {
		ghost.style.transform = `translate(${px - offsetX}px, ${py - offsetY}px) rotate(-1deg)`;
	};
	at(x, y);
	return { at, remove: () => ghost.remove() };
}

export function startSectionDrag(
	event: PointerEvent,
	{
		siblings,
		ids,
		from,
		onover,
		ondrop,
	}: {
		/** The sibling sections' elements, in order. */
		siblings: () => HTMLElement[];
		ids: string[];
		from: number;
		onover: (at: number | null) => void;
		ondrop: (ids: string[]) => void;
	},
) {
	if (event.button !== 0) return;
	const handle = event.currentTarget as HTMLElement;
	event.preventDefault();
	// The drag is followed on the window, not the handle: the section (and its
	// handle) is hidden behind its placeholder while it moves.
	const pointer = event.pointerId;
	const area = scroller(handle);
	let x = event.clientX;
	let y = event.clientY;
	let at: number | null = null;
	let frame = 0;
	const section = siblings()[from];
	const ghost = section ? liftedCopy(section, x, y) : null;

	const place = () => {
		at = dropIndex(y, siblings().map((el) => el.getBoundingClientRect()));
		onover(at === from || at === from + 1 ? null : at);
	};
	const tickScroll = () => {
		frame = 0;
		if (!area) return;
		const box = area.getBoundingClientRect();
		const edge = 56;
		const step = y < box.top + edge ? -12 : y > box.bottom - edge ? 12 : 0;
		if (!step) return;
		area.scrollTop += step;
		place();
		frame = requestAnimationFrame(tickScroll);
	};
	const move = (e: PointerEvent) => {
		if (e.pointerId !== pointer) return;
		x = e.clientX;
		y = e.clientY;
		ghost?.at(x, y);
		place();
		if (!frame) frame = requestAnimationFrame(tickScroll);
	};
	const end = (e: PointerEvent) => {
		if (e.pointerId !== pointer) return;
		// Where it's let go decides, not the last move
		if (e.type === "pointerup") {
			x = e.clientX;
			y = e.clientY;
			place();
		}
		window.removeEventListener("pointermove", move);
		window.removeEventListener("pointerup", end);
		window.removeEventListener("pointercancel", end);
		if (frame) cancelAnimationFrame(frame);
		ghost?.remove();
		onover(null);
		if (e.type === "pointerup" && at != null && at !== from && at !== from + 1) {
			ondrop(orderAfterDrop(ids, from, at));
		}
	};
	window.addEventListener("pointermove", move);
	window.addEventListener("pointerup", end);
	window.addEventListener("pointercancel", end);
}
