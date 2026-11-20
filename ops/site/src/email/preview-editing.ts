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
};

const GOLD = "#dba63c";

/** How typeable words look in the preview: a dashed gold line on hover, solid while typing, and what an empty one says. */
const EDITING_CSS = `
[data-edit] { cursor: text; outline: 2px dashed transparent; outline-offset: 6px; border-radius: 2px; transition: outline-color 120ms; min-height: 1.2em; }
[data-edit]:hover { outline-color: ${GOLD}99; }
[data-edit]:focus { outline: 2px solid ${GOLD}; }
[data-edit][data-empty]::before, [data-edit][data-empty] > p:first-child::before { color: rgba(242, 232, 210, 0.45); font-style: italic; pointer-events: none; float: left; height: 0; }
h2[data-edit][data-empty]::before { content: attr(data-placeholder); }
td[data-edit][data-empty] > p:first-child::before { content: attr(data-placeholder); }
a { cursor: text; }
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

	// While editing, links don't open: a click is for typing.
	doc.addEventListener("click", (event) => {
		if ((event.target as Element | null)?.closest?.("a")) event.preventDefault();
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
