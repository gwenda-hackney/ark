/**
 * One Help drawer per editor, and the "?" beside its fields that opens it.
 *
 * The editor calls `provideHelp(title, topics)` and renders
 * `<HelpDrawer help={...} />`; PageHelp in its header opens the whole list.
 * A Field, FormSection, FormHeading or HelpTip below it with `help="Topic
 * title"` gets a "?" button that opens the same drawer searched for that
 * topic; clearing the search shows them all. No provider, or no such topic:
 * no "?".
 */
import { getContext, setContext } from "svelte";
import type { PageHelpTopic } from "./types";

const KEY = Symbol("help");

export class HelpController {
	open = $state(false);
	/** The drawer's search box. A "?" fills it with `field:<its topic>`. */
	query = $state("");
	readonly #title: () => string;
	readonly #topics: () => PageHelpTopic[];

	constructor(title: () => string, topics: () => PageHelpTopic[]) {
		this.#title = title;
		this.#topics = topics;
	}

	get title(): string {
		return this.#title();
	}

	get topics(): PageHelpTopic[] {
		return this.#topics();
	}

	/** The topic a `field:` search names exactly, if any. */
	get focus(): string | null {
		const field = parseHelpQuery(this.query).field?.toLowerCase();
		if (!field) return null;
		return this.topics.find((t) => t.title.toLowerCase() === field)?.title ?? null;
	}

	has(topic: string): boolean {
		return this.topics.some((t) => t.title === topic);
	}

	/** Open searched for one topic, or on every topic when none is given. */
	show(topic?: string) {
		this.query = topic && this.has(topic) ? `field:${topic}` : "";
		this.open = true;
	}

	showAll() {
		this.query = "";
	}

	close() {
		this.open = false;
	}
}

const FIELD = /^field:\s*/i;

/**
 * A help search: `field:Name` looks only at titles (the rest of the box is
 * the title, spaces and all); anything else is free text.
 */
export function parseHelpQuery(query: string): { field?: string; text?: string } {
	const q = query.trim();
	if (!q) return {};
	if (FIELD.test(q)) return { field: q.replace(FIELD, "").trim() };
	return { text: q };
}

/**
 * Topics matching `query`. `field:x` keeps titles starting with x, the exact
 * title first. Free text matches title or text: exact title first, then
 * title matches, then text matches. An empty query keeps every topic in order.
 */
export function filterHelp(topics: PageHelpTopic[], query: string): PageHelpTopic[] {
	const { field, text } = parseHelpQuery(query);
	let rank: (t: PageHelpTopic) => number;
	if (field !== undefined) {
		const f = field.toLowerCase();
		rank = (t) => {
			const title = t.title.toLowerCase();
			if (title === f) return 0;
			return title.startsWith(f) ? 1 : -1;
		};
	} else if (text) {
		const q = text.toLowerCase();
		rank = (t) => {
			const title = t.title.toLowerCase();
			if (title === q) return 0;
			if (title.includes(q)) return 1;
			return t.body.toLowerCase().includes(q) ? 2 : -1;
		};
	} else return topics;
	return topics
		.map((t) => ({ t, r: rank(t) }))
		.filter((x) => x.r >= 0)
		.sort((a, b) => a.r - b.r)
		.map((x) => x.t);
}

/** Pass getters so a title or list that changes with the page stays current. */
export function provideHelp(
	title: string | (() => string),
	topics: PageHelpTopic[] | (() => PageHelpTopic[]),
): HelpController {
	const ctrl = new HelpController(
		typeof title === "function" ? title : () => title,
		typeof topics === "function" ? topics : () => topics,
	);
	setContext(KEY, ctrl);
	return ctrl;
}

export function getHelp(): HelpController | undefined {
	return getContext<HelpController | undefined>(KEY);
}
