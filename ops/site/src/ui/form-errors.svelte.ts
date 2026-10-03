/**
 * One form's problems, field by field. A validator fills it with
 * field id → message; Fields show the message under their control; on
 * submit the editor switches to the tab holding the first problem and
 * focuses it. The action bar shows the count.
 *
 *   const errors = new FormErrors();
 *   errors.replace(validateEvent(form));   // { "event-name": "Add a name." }
 *   if (errors.count) return errors.reveal({ order, tabOf, showTab });
 *   <Field for="event-name" error={errors.get("event-name")} …>
 */
import { tick } from "svelte";

export type ErrorMap = Record<string, string>;

/** Drop blank messages. */
export function cleanErrors(map: ErrorMap | null | undefined): ErrorMap {
	const out: ErrorMap = {};
	for (const [key, message] of Object.entries(map || {})) {
		if (message) out[key] = message;
	}
	return out;
}

/**
 * The field to send someone to first: the earliest in `order` (the order
 * the fields appear on screen, across tabs), else the first one set.
 */
export function firstErrorKey(map: ErrorMap, order: readonly string[] = []): string {
	const keys = Object.keys(cleanErrors(map));
	if (!keys.length) return "";
	for (const key of order) if (keys.includes(key)) return key;
	return keys[0];
}

export type RevealOptions = {
	/** Field ids in screen order, across tabs. */
	order?: readonly string[];
	/** Which tab a field lives on, so it can be shown before focusing. */
	tabOf?: (key: string) => string | undefined;
	/** The current tab; when the first error is elsewhere `showTab` is called. */
	currentTab?: string;
	showTab?: (tab: string) => void | Promise<void>;
	/** Find the element to focus (default: document.getElementById(key)). */
	find?: (key: string) => HTMLElement | null;
};

/**
 * Show the first problem: switch to its tab if needed, wait for it to
 * render, then focus and scroll to it. Returns the field id it went to.
 */
export async function revealFirstError(map: ErrorMap, opts: RevealOptions = {}): Promise<string> {
	const key = firstErrorKey(map, opts.order);
	if (!key) return "";
	const tab = opts.tabOf?.(key);
	if (tab && tab !== opts.currentTab && opts.showTab) {
		await opts.showTab(tab);
	}
	// A tab switch renders on the next tick; a transition can take a frame more.
	for (let attempt = 0; attempt < 6; attempt += 1) {
		await tick();
		const el = (opts.find ?? defaultFind)(key);
		if (el) {
			el.focus({ preventScroll: true });
			el.scrollIntoView?.({ block: "center", behavior: "smooth" });
			return key;
		}
		await new Promise((resolve) => setTimeout(resolve, 30));
	}
	return key;
}

function defaultFind(key: string): HTMLElement | null {
	if (typeof document === "undefined") return null;
	return document.getElementById(key);
}

export class FormErrors {
	map = $state<ErrorMap>({});
	count = $derived(Object.keys(this.map).length);

	get = (key: string): string => this.map[key] || "";

	set = (key: string, message: string) => {
		const next = { ...this.map };
		if (message) next[key] = message;
		else delete next[key];
		this.map = next;
	};

	/** Typing in a field clears its message (others stay until the next save). */
	clear = (key: string) => {
		if (key in this.map) this.set(key, "");
	};

	clearAll = () => {
		if (this.count) this.map = {};
	};

	replace = (map: ErrorMap) => {
		this.map = cleanErrors(map);
	};

	first = (order: readonly string[] = []) => firstErrorKey(this.map, order);

	reveal = (opts: RevealOptions = {}) => revealFirstError(this.map, opts);
}

/** "1 thing to fix" / "3 things to fix", for the action bar. */
export function errorCountLabel(count: number): string {
	if (!count) return "";
	return count === 1 ? "1 thing to fix" : `${count} things to fix`;
}
