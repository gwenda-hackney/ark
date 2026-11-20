/**
 * The email in the editor's frame, brought up to date in place instead of
 * loaded again: loading it again blanks the frame and fetches every picture
 * anew, so a part dropped somewhere else made the whole email flicker.
 *
 * What's drawn now is compared with what was drawn before (both as the
 * renderer wrote them, so the editor's own additions to the live page, its
 * grips and typing, don't count as changes): a part that's the same but has
 * moved is moved, as it is, pictures and all; only what's different is
 * drawn anew. The editor's own elements (`data-ops`) are left where they are.
 */

/** The marks that say where a part is; a part that only moved differs in nothing else. */
const PLACE = /\s(data-section|data-insert)="\d+"/g;

const keyOf = (node: Node): string =>
	node.nodeType === 1 ? (node as Element).outerHTML.replace(PLACE, "") : `${node.nodeType}:${node.nodeValue ?? ""}`;

const isOps = (node: Node) => node.nodeType === 1 && (node as Element).hasAttribute("data-ops");

/** Whether a part of the email (a row the editor marks) is inside: then it's gone through, not drawn anew. */
const holdsParts = (node: Node) => node.nodeType === 1 && Boolean((node as Element).querySelector("[data-section], [data-insert]"));

/** The place marks of `from`, on `to` (a part that moved keeps its new place). */
function placeOf(to: Element, from: Element) {
	for (const name of ["data-section", "data-insert"]) {
		const value = from.getAttribute(name);
		if (value === null) to.removeAttribute(name);
		else to.setAttribute(name, value);
	}
}

/**
 * Makes `live`'s children what `next`'s are, where `was` is what `live` was
 * drawn from: children the same as before stay (moved if they need to be),
 * ones holding parts are gone through in turn, the rest are drawn anew.
 */
function patchChildren(live: Element, was: Element, next: Element) {
	const doc = live.ownerDocument;
	const liveKids = Array.from(live.childNodes).filter((node) => !isOps(node));
	const ops = Array.from(live.childNodes).filter(isOps);
	const wasKids = Array.from(was.childNodes);
	// What `live` holds and what it was drawn from line up one for one (the editor's own aside).
	if (liveKids.length !== wasKids.length) {
		live.replaceChildren(...Array.from(next.childNodes).map((node) => doc.importNode(node, true)), ...ops);
		return;
	}
	const free = wasKids.map((node, at) => ({ key: keyOf(node), was: node, live: liveKids[at], used: false }));
	const out: Node[] = Array.from(next.childNodes).map((node) => {
		const key = keyOf(node);
		const same = free.find((entry) => !entry.used && entry.key === key);
		if (same) {
			same.used = true;
			if (node.nodeType === 1) placeOf(same.live as Element, node as Element);
			return same.live;
		}
		if (holdsParts(node)) {
			const tag = (node as Element).tagName;
			const like = free.find((entry) => !entry.used && entry.was.nodeType === 1 && (entry.was as Element).tagName === tag && holdsParts(entry.was));
			if (like) {
				like.used = true;
				const target = like.live as Element;
				for (const attr of Array.from(target.attributes)) if (!(node as Element).hasAttribute(attr.name)) target.removeAttribute(attr.name);
				for (const attr of Array.from((node as Element).attributes)) target.setAttribute(attr.name, attr.value);
				patchChildren(target, like.was as Element, node as Element);
				return target;
			}
		}
		return doc.importNode(node, true);
	});
	// Only what's changed is touched: a node already in its place stays put (moving one would reload its pictures in some browsers).
	let at = 0;
	for (const node of out) {
		const here = Array.from(live.childNodes).filter((child) => !isOps(child))[at];
		if (here !== node) live.insertBefore(node, here ?? ops[0] ?? null);
		at += 1;
	}
	for (const entry of free) if (!entry.used && entry.live.parentNode === live) entry.live.remove();
}

/**
 * Brings the frame's email from what `before` drew to what `after` draws
 * (both whole email documents as the renderer writes them), in place.
 */
export function patchEmail(doc: Document, before: string, after: string) {
	if (before === after) return;
	const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
	patchChildren(doc.body, parse(before).body, parse(after).body);
}
