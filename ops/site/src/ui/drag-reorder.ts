/**
 * Dragging things into a new order, the one way ops does it (the Photos
 * page's tiles, the email editor's parts): what's being moved follows the
 * pointer as a label ("Moving: Picture · The bar"), it fades where it was, a
 * gold line shows where it will land, the page scrolls near its edges, and
 * letting go anywhere puts it at the nearest place.
 *
 * Plain DOM, so it works in an email's frame as well as on a page: give it
 * the container, how to find the items (and, optionally, the handle words
 * must be dragged by), and what to do on a drop. The order itself is the
 * caller's: `onmove(from, at)` says "item `from` goes before item `at`"
 * (`at` = the count: after the last). See `movedTo`.
 */

export type ReorderOptions = {
	/** The items in order, e.g. `tr[data-section]` or `.tile`. */
	items: string;
	/** Only these start a drag, when given (an item whose words can be selected drags by its handle). */
	handle?: string;
	/** Items that drag from anywhere on them, besides the handle (a picture, a card). Default: all, when there's no handle. */
	whole?: (item: HTMLElement) => boolean;
	/** Down a column ("y"), or across rows of a grid ("grid"). */
	axis: "y" | "grid";
	/** What the label under the pointer says about an item. */
	label: (item: HTMLElement) => string;
	/** Item `from` was let go before item `at` (the count: after the last). Not called when it wouldn't move. */
	onmove: (from: number, at: number) => void;
	/** The element that scrolls while dragging near its edges; default: the nearest scrolling ancestor (through a frame). */
	scroller?: () => HTMLElement | null;
	/** The drag can't start now (saving, a sent email). */
	disabled?: () => boolean;
	/** Drags that start here are something else's (a Row's cells, which swap). */
	ignore?: string;
};

const GOLD = "#dba63c";

/** Where an item dropped at `point` lands: before the first item past the pointer (midpoints), else after the last. */
export function insertionIndex(boxes: { top: number; left: number; width: number; height: number }[], x: number, y: number, axis: "y" | "grid"): number {
	for (let i = 0; i < boxes.length; i += 1) {
		const box = boxes[i];
		if (axis === "y") {
			if (y < box.top + box.height / 2) return i;
		} else {
			const below = y > box.top + box.height;
			const sameRow = y >= box.top && y <= box.top + box.height;
			if (!below && (!sameRow || x < box.left + box.width / 2)) return i;
		}
	}
	return boxes.length;
}

/** A list with item `from` placed before item `at` (the length: after the last); the same list when it wouldn't move. */
export function movedTo<T>(list: T[], from: number, at: number): T[] {
	if (from < 0 || from >= list.length || at === from || at === from + 1) return list;
	const rest = list.filter((_, index) => index !== from);
	const place = at > from ? at - 1 : at;
	return [...rest.slice(0, place), list[from], ...rest.slice(place)];
}

function scrollingParent(el: Element | null): HTMLElement | null {
	let node: Element | null = el;
	while (node) {
		const style = node.ownerDocument.defaultView?.getComputedStyle(node);
		if (style && /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node as HTMLElement;
		node = node.parentElement || (node.ownerDocument.defaultView?.frameElement ?? null);
	}
	return null;
}

/** Makes `container`'s items draggable into a new order. Returns a function that stops it. */
export function attachReorder(container: HTMLElement, options: ReorderOptions): () => void {
	const doc = container.ownerDocument;
	const view = doc.defaultView;
	const items = () => Array.from(container.querySelectorAll<HTMLElement>(options.items));
	let from = -1;
	let line: HTMLElement | null = null;
	let ghost: HTMLElement | null = null;

	for (const item of items()) {
		if (!options.handle || options.whole?.(item)) item.draggable = true;
		// A picture never starts the browser's own image drag.
		for (const img of Array.from(item.querySelectorAll("img"))) img.draggable = false;
	}
	if (options.handle) for (const handle of Array.from(container.querySelectorAll<HTMLElement>(options.handle))) handle.draggable = true;

	function showLine(at: number) {
		const list = items();
		if (!line) {
			line = doc.createElement("div");
			line.setAttribute("data-ops", "");
			line.setAttribute("aria-hidden", "true");
			Object.assign(line.style, {
				position: "absolute",
				zIndex: "50",
				pointerEvents: "none",
				background: GOLD,
				borderRadius: "3px",
				boxShadow: `0 0 0 3px ${GOLD}40`,
			});
			doc.body.append(line);
		}
		const sx = view?.scrollX ?? 0;
		const sy = view?.scrollY ?? 0;
		const before = list[at]?.getBoundingClientRect();
		const after = list[at - 1]?.getBoundingClientRect();
		if (options.axis === "y") {
			const box = before || after;
			if (!box) return;
			const y = before && after ? (after.bottom + before.top) / 2 : before ? before.top : after!.bottom;
			Object.assign(line.style, { left: `${box.left + sx}px`, top: `${y + sy - 2}px`, width: `${box.width}px`, height: "4px" });
		} else {
			const box = before || after;
			if (!box) return;
			const x = before ? before.left - 6 : after!.right + 2;
			Object.assign(line.style, { left: `${x + sx}px`, top: `${box.top + sy}px`, width: "4px", height: `${box.height}px` });
		}
	}

	function clear() {
		line?.remove();
		line = null;
		ghost?.remove();
		ghost = null;
		for (const item of items()) item.classList.remove("ops-dragging");
		from = -1;
	}

	function scrollNear(clientY: number) {
		const scroller = options.scroller?.() ?? scrollingParent(container);
		if (!scroller) return;
		const frame = view?.frameElement as HTMLElement | null;
		const onPage = (frame && scroller.ownerDocument !== doc ? frame.getBoundingClientRect().top : 0) + clientY;
		const edges = scroller.getBoundingClientRect();
		if (onPage < edges.top + 70) scroller.scrollBy(0, -18);
		else if (onPage > edges.bottom - 70) scroller.scrollBy(0, 18);
	}

	const onstart = (event: DragEvent) => {
		const target = event.target as Element | null;
		if (options.ignore && target?.closest?.(options.ignore)) return;
		const item = target?.closest?.(options.items) as HTMLElement | null;
		if (!item || !container.contains(item) || options.disabled?.()) return;
		const byHandle = options.handle ? target?.closest?.(options.handle) : null;
		if (options.handle && !byHandle && !options.whole?.(item)) return;
		from = items().indexOf(item);
		item.classList.add("ops-dragging");
		// What's moving, under the pointer: its name, not a sliver of it.
		ghost = doc.createElement("div");
		ghost.textContent = `Moving: ${options.label(item)}`;
		Object.assign(ghost.style, {
			position: "absolute",
			top: "-1000px",
			left: "0",
			padding: "8px 12px",
			borderRadius: "8px",
			background: "#0b0a08",
			border: `2px solid ${GOLD}`,
			color: "#f2e8d2",
			font: "600 14px/1.2 system-ui, -apple-system, sans-serif",
			whiteSpace: "nowrap",
			maxWidth: "320px",
			overflow: "hidden",
			textOverflow: "ellipsis",
		});
		doc.body.append(ghost);
		event.dataTransfer?.setData("text/plain", "ops-reorder");
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setDragImage(ghost, 16, 16);
		}
		event.stopPropagation();
	};

	const onover = (event: DragEvent) => {
		if (from < 0) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		scrollNear(event.clientY);
		const at = insertionIndex(
			items().map((item) => item.getBoundingClientRect()),
			event.clientX,
			event.clientY,
			options.axis,
		);
		showLine(at);
	};

	const ondrop = (event: DragEvent) => {
		if (from < 0) return;
		event.preventDefault();
		event.stopPropagation();
		const at = insertionIndex(
			items().map((item) => item.getBoundingClientRect()),
			event.clientX,
			event.clientY,
			options.axis,
		);
		const was = from;
		clear();
		if (at !== was && at !== was + 1) options.onmove(was, at);
	};

	const onend = () => clear();

	// On the document, so a drop in a gap (or past the last item) still counts.
	container.addEventListener("dragstart", onstart);
	doc.addEventListener("dragover", onover);
	doc.addEventListener("drop", ondrop);
	doc.addEventListener("dragend", onend);
	return () => {
		clear();
		container.removeEventListener("dragstart", onstart);
		doc.removeEventListener("dragover", onover);
		doc.removeEventListener("drop", ondrop);
		doc.removeEventListener("dragend", onend);
	};
}
