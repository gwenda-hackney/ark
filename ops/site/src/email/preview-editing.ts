/**
 * Typing straight into the email's preview (#348, the editor for someone who
 * barely uses a computer): the preview is drawn with the editor's marks
 * (shared/email/sections.js, `marks`), and this makes its headings and copy
 * typeable, tells the editor what each now says, and does Bold and Link for
 * the toolbar. The frame runs no scripts of its own; ops reaches into it
 * (same origin) to listen.
 */
import { copyFromDom, headingFromDom } from "./copy-dom";

export type EditKind = "heading" | "copy";

/** Where the typing is, for the toolbar: which kind of words, and what the selection could become. */
export type WordsFocus = {
	kind: EditKind;
	index: number;
	/** Words are selected (a link needs some). */
	selected: boolean;
	/** The selection is bold. */
	bold: boolean;
	/** The selection is in a link. */
	inLink: boolean;
};

export type EditingHandlers = {
	/** What a section's words are now. */
	ontext: (index: number, kind: EditKind, text: string) => void;
	/** The typing moved, started (a focus) or stopped (null). */
	onfocus: (focus: WordsFocus | null) => void;
	/** A part of the email was clicked: section `index`. */
	onselect: (index: number) => void;
	/** A + was pressed: add a part before section `at` (the count: after the last). */
	oninsert: (at: number) => void;
	/** Section `from` was dragged and let go before section `at` (the count: after the last). */
	onmove: (from: number, at: number) => void;
	/** A Row's cell was dragged onto another cell: swap them. */
	oncells: (from: { section: number; cell: number }, to: { section: number; cell: number }) => void;
};

const GOLD = "#dba63c";

/**
 * How the preview shows what can be changed: a part's whole background tints
 * gold under the pointer, a picked part more so, with a gold edge; the words
 * being typed glow a little; an empty one says what to type; a + between
 * parts adds one there.
 */
const EDITING_CSS = `
tr[data-section] > td { transition: background-color 120ms, box-shadow 120ms; }
tr[data-section]:hover > td { background-color: ${GOLD}1f; cursor: pointer; }
tr[data-section].ops-selected > td { background-color: ${GOLD}2e; box-shadow: inset 4px 0 0 ${GOLD}; }
[data-edit] { cursor: text; outline: none; min-height: 1.2em; border-radius: 2px; }
[data-edit]:focus { background-color: ${GOLD}14; box-shadow: 0 2px 0 ${GOLD}; }
[data-edit][data-empty]::before, [data-edit][data-empty] > p:first-child::before { color: rgba(242, 232, 210, 0.45); font-style: italic; pointer-events: none; float: left; height: 0; }
h2[data-edit][data-empty]::before { content: attr(data-placeholder); }
td[data-edit][data-empty] > p:first-child::before { content: attr(data-placeholder); }
[data-waiting] { cursor: pointer; }
a { cursor: text; }
tr[data-insert] > td { padding-top: 0 !important; padding-bottom: 0 !important; }
tr[data-section] > td { position: relative; }
.ops-grip { position: absolute; left: -4px; top: 50%; transform: translateY(-50%); width: 20px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 5px; background: ${GOLD}; color: #1a1510; font: 700 15px/1 system-ui, sans-serif; cursor: grab; opacity: 0; transition: opacity 120ms; user-select: none; -webkit-user-select: none; }
tr[data-section]:hover .ops-grip, tr[data-section].ops-selected .ops-grip { opacity: 1; }
tr.ops-dragging > td { opacity: 0.4; }
tr[data-insert].ops-drop .ops-add::before { border-top: 4px solid ${GOLD}; }
tr[data-insert].ops-drop .ops-add::after { background: ${GOLD}; color: #1a1510; }
td[data-cell][draggable="true"] { cursor: grab; }
td[data-cell].ops-cell-drop { outline: 3px dashed ${GOLD}; outline-offset: 2px; }
td[data-cell].ops-dragging { opacity: 0.4; }
.ops-add { display: block; position: relative; width: 100%; height: 26px; margin: 0; padding: 0; border: 0; background: transparent; color: transparent; cursor: pointer; }
.ops-add::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; border-top: 2px dashed ${GOLD}40; }
.ops-add::after { content: "+"; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 26px; height: 26px; box-sizing: border-box; border-radius: 50%; border: 2px solid ${GOLD}; background: #1a1510; color: ${GOLD}; font: 700 18px/22px Georgia, serif; text-align: center; }
.ops-add:hover::before, .ops-add.ops-here::before { border-top-color: ${GOLD}; }
.ops-add:hover::after, .ops-add.ops-here::after { background: ${GOLD}; color: #1a1510; }
`;

function hostOf(node: Node | null): HTMLElement | null {
	const el = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
	return (el?.closest("[data-edit]") as HTMLElement | null) || null;
}

function indexOf(host: HTMLElement): number {
	return Number((host.closest("[data-section]") as HTMLElement | null)?.dataset.section ?? -1);
}

function kindOf(host: HTMLElement): EditKind {
	return host.dataset.edit === "heading" ? "heading" : "copy";
}

function textOf(host: HTMLElement): string {
	return kindOf(host) === "heading" ? headingFromDom(host) : copyFromDom(host);
}

function markEmpty(host: HTMLElement) {
	if (textOf(host)) delete host.dataset.empty;
	else host.dataset.empty = "";
}

/** The typing's place and what the toolbar can do there, or null when nobody's typing. */
export function wordsFocus(doc: Document): WordsFocus | null {
	const active = doc.activeElement as HTMLElement | null;
	const host = active?.matches?.("[data-edit]") ? active : null;
	if (!host) return null;
	const selection = doc.getSelection();
	const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
	const inside = Boolean(range && host.contains(range.commonAncestorContainer));
	const anchor = inside ? (range!.commonAncestorContainer as Node) : null;
	const el = anchor && (anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement);
	return {
		kind: kindOf(host),
		index: indexOf(host),
		selected: Boolean(inside && range && !range.collapsed && range.toString().trim()),
		bold: inside && doc.queryCommandState("bold"),
		inLink: Boolean(el?.closest("a")),
	};
}

/**
 * Makes the preview's words typeable (when the email can still change) and
 * listens. Called each time the frame loads its document; the listeners go
 * with the document.
 */
export function attachEditing(doc: Document, editable: boolean, handlers: EditingHandlers) {
	const style = doc.createElement("style");
	style.textContent = EDITING_CSS;
	doc.head.append(style);

	for (const host of Array.from(doc.querySelectorAll<HTMLElement>("[data-edit]"))) {
		if (!editable) continue;
		const heading = kindOf(host) === "heading";
		// A heading is plain words; copy keeps bold and links.
		host.setAttribute("contenteditable", heading ? "plaintext-only" : "true");
		host.setAttribute("spellcheck", "true");
		host.setAttribute("lang", "en-GB");
		host.setAttribute("role", "textbox");
		host.setAttribute("aria-label", heading ? "Heading" : "Text");
		if (!heading) {
			host.setAttribute("aria-multiline", "true");
			// The caret lands inside the paragraph, not beside it.
			for (const p of Array.from(host.querySelectorAll("p"))) if (!p.innerHTML) p.innerHTML = "<br>";
			const first = host.querySelector("p");
			if (first) first.setAttribute("data-placeholder", host.dataset.placeholder || "");
		}
		markEmpty(host);
	}
	if (!editable) return;

	// A + in each place a part can go.
	for (const slot of Array.from(doc.querySelectorAll<HTMLElement>("tr[data-insert] > td"))) {
		const add = doc.createElement("button");
		add.type = "button";
		add.className = "ops-add";
		add.textContent = "+";
		add.setAttribute("aria-label", "Add something here");
		slot.append(add);
	}

	// A grip on each part, to drag it by; a Row's filled cells drag on their own.
	for (const row of Array.from(doc.querySelectorAll<HTMLElement>("tr[data-section]"))) {
		const cell = row.querySelector(":scope > td");
		if (!cell) continue;
		const grip = doc.createElement("span");
		grip.className = "ops-grip";
		grip.draggable = true;
		grip.textContent = "⠿";
		grip.title = "Drag to move";
		grip.setAttribute("aria-hidden", "true");
		// The editor's own, never words: not typed into, and left out of what the words say (copy-dom.ts).
		grip.contentEditable = "false";
		grip.dataset.ops = "";
		cell.prepend(grip);
	}
	for (const cell of Array.from(doc.querySelectorAll<HTMLElement>("td[data-cell]"))) {
		if (!cell.querySelector("[data-waiting]")) cell.draggable = true;
	}
	attachDragging(doc, handlers);

	const tell = () => handlers.onfocus(wordsFocus(doc));

	doc.addEventListener("input", (event) => {
		const host = hostOf(event.target as Node);
		if (!host) return;
		markEmpty(host);
		const first = host.querySelector("p");
		if (first && !first.dataset.placeholder) first.setAttribute("data-placeholder", host.dataset.placeholder || "");
		handlers.ontext(indexOf(host), kindOf(host), textOf(host));
		tell();
	});

	doc.addEventListener("keydown", (event) => {
		const host = hostOf(event.target as Node);
		if (!host) return;
		// A heading is one line: Enter finishes it. Escape finishes either.
		if (event.key === "Escape" || (event.key === "Enter" && kindOf(host) === "heading")) {
			event.preventDefault();
			host.blur();
		}
	});

	// Pasted words come in as plain words, never someone else's styles.
	doc.addEventListener("paste", (event) => {
		const host = hostOf(event.target as Node);
		if (!host) return;
		event.preventDefault();
		let words = event.clipboardData?.getData("text/plain") || "";
		if (kindOf(host) === "heading") words = words.replace(/\s+/g, " ");
		doc.execCommand("insertText", false, words);
	});

	// A click picks the part it's on (or adds, on a +); links don't open: a click is for changing.
	doc.addEventListener("click", (event) => {
		const target = event.target as Element | null;
		if (target?.closest?.("a")) event.preventDefault();
		const add = target?.closest?.(".ops-add");
		if (add) {
			handlers.oninsert(Number((add.closest("tr[data-insert]") as HTMLElement | null)?.dataset.insert ?? 0));
			return;
		}
		const part = target?.closest?.("tr[data-section]") as HTMLElement | null;
		if (part) handlers.onselect(Number(part.dataset.section));
	});

	doc.addEventListener("focusin", tell);
	doc.addEventListener("focusout", () => queueMicrotask(tell));
	doc.addEventListener("selectionchange", tell);
	doc.defaultView?.addEventListener("blur", () => handlers.onfocus(null));
}

/** Bold on or off for the selected words. */
export function toggleBold(doc: Document) {
	doc.execCommand("bold");
}

/** The selection, kept while the link's address is typed outside the frame. */
export function keepSelection(doc: Document): Range | null {
	const selection = doc.getSelection();
	return selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
}

/** Turns the kept selection into a link to `address`. */
export function addLink(doc: Document, kept: Range | null, address: string) {
	const host = hostOf(kept?.commonAncestorContainer ?? null);
	if (!kept || !host) return;
	host.focus();
	const selection = doc.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(kept);
	doc.execCommand("createLink", false, address);
}

/** Takes the link off the words the typing is in (the words stay). */
export function removeLink(doc: Document) {
	const selection = doc.getSelection();
	const node = selection?.anchorNode ?? null;
	const link = (node && (node.nodeType === 1 ? (node as Element) : node.parentElement))?.closest("a");
	if (!link || !selection) return;
	// Select the whole link, so all of it goes.
	const range = doc.createRange();
	range.selectNodeContents(link);
	selection.removeAllRanges();
	selection.addRange(range);
	doc.execCommand("unlink");
	selection.collapseToEnd();
}

/** Shows which part is picked, and which + is adding (each may be null), without drawing the email again. */
export function showSelected(doc: Document, index: number | null, insertingAt: number | null) {
	for (const row of Array.from(doc.querySelectorAll<HTMLElement>("tr[data-section]"))) {
		row.classList.toggle("ops-selected", index !== null && Number(row.dataset.section) === index);
	}
	for (const row of Array.from(doc.querySelectorAll<HTMLElement>("tr[data-insert]"))) {
		row.querySelector(".ops-add")?.classList.toggle("ops-here", insertingAt !== null && Number(row.dataset.insert) === insertingAt);
	}
}

/** Puts the typing in section `index`'s words, at their end (after it's been added). */
export function focusWords(doc: Document, index: number) {
	const host = doc.querySelector<HTMLElement>(`tr[data-section="${index}"] [data-edit]`);
	if (!host) return;
	host.focus();
	const selection = doc.getSelection();
	const range = doc.createRange();
	range.selectNodeContents(host.querySelector("p:last-child") || host);
	range.collapse(false);
	selection?.removeAllRanges();
	selection?.addRange(range);
	host.scrollIntoView({ block: "center" });
}

type Dragging = { type: "section"; index: number } | { type: "cell"; section: number; cell: number };

const sectionOf = (el: Element | null) => Number((el?.closest("tr[data-section]") as HTMLElement | null)?.dataset.section ?? -1);

/** Where a dragged part would land under the pointer: before the part it's over (its top half) or after it. */
function dropPlace(doc: Document, target: Element | null, y: number): number | null {
	const slot = target?.closest("tr[data-insert]") as HTMLElement | null;
	if (slot) return Number(slot.dataset.insert);
	const row = target?.closest("tr[data-section]") as HTMLElement | null;
	if (!row) return null;
	const box = row.getBoundingClientRect();
	return Number(row.dataset.section) + (y < box.top + box.height / 2 ? 0 : 1);
}

function clearDrop(doc: Document) {
	for (const el of Array.from(doc.querySelectorAll(".ops-drop, .ops-cell-drop, .ops-dragging"))) {
		el.classList.remove("ops-drop", "ops-cell-drop", "ops-dragging");
	}
}

/** Dragging parts by their grip, and a Row's cells onto other cells, with a gold mark where they'd land. */
function attachDragging(doc: Document, handlers: EditingHandlers) {
	let dragging: Dragging | null = null;

	doc.addEventListener("dragstart", (event) => {
		const target = event.target as Element | null;
		const grip = target?.closest?.(".ops-grip");
		const cell = target?.closest?.("td[data-cell]") as HTMLElement | null;
		if (grip) {
			dragging = { type: "section", index: sectionOf(grip) };
			grip.closest("tr")?.classList.add("ops-dragging");
		} else if (cell) {
			dragging = { type: "cell", section: sectionOf(cell), cell: Number(cell.dataset.cell) };
			cell.classList.add("ops-dragging");
		} else {
			return;
		}
		event.dataTransfer?.setData("text/plain", "gwenda-email-part");
		if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
	});

	doc.addEventListener("dragover", (event) => {
		if (!dragging) return;
		const target = event.target as Element | null;
		for (const el of Array.from(doc.querySelectorAll(".ops-drop, .ops-cell-drop"))) el.classList.remove("ops-drop", "ops-cell-drop");
		if (dragging.type === "section") {
			const at = dropPlace(doc, target, event.clientY);
			if (at === null) return;
			event.preventDefault();
			doc.querySelector(`tr[data-insert="${at}"]`)?.classList.add("ops-drop");
		} else {
			const cell = target?.closest?.("td[data-cell]");
			if (!cell) return;
			event.preventDefault();
			cell.classList.add("ops-cell-drop");
		}
	});

	doc.addEventListener("drop", (event) => {
		if (!dragging) return;
		event.preventDefault();
		const target = event.target as Element | null;
		const was = dragging;
		dragging = null;
		clearDrop(doc);
		if (was.type === "section") {
			const at = dropPlace(doc, target, event.clientY);
			if (at !== null) handlers.onmove(was.index, at);
		} else {
			const cell = target?.closest?.("td[data-cell]") as HTMLElement | null;
			if (cell) handlers.oncells({ section: was.section, cell: was.cell }, { section: sectionOf(cell), cell: Number(cell.dataset.cell) });
		}
	});

	doc.addEventListener("dragend", () => {
		dragging = null;
		clearDrop(doc);
	});
}

/** Brings section `index` into the middle of the email's view. */
export function scrollToPart(doc: Document, index: number) {
	doc.querySelector(`tr[data-section="${index}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
}
