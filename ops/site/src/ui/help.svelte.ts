/**
 * One Help drawer per editor, and the "?" beside its fields that opens it.
 *
 * The editor calls `provideHelp(title, topics)` and renders
 * `<HelpDrawer help={...} />`; PageHelp in its header opens the whole list.
 * A Field, FormSection, FormHeading or HelpTip below it with `help="Topic
 * title"` gets a "?" button that opens the same drawer on that one topic,
 * with Show all help under it. No provider, or no such topic: no "?".
 */
import { getContext, setContext } from "svelte";
import type { PageHelpTopic } from "./types";

const KEY = Symbol("help");

export class HelpController {
	open = $state(false);
	/** The topic the drawer is showing on its own; null shows them all. */
	focus = $state<string | null>(null);
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

	has(topic: string): boolean {
		return this.topics.some((t) => t.title === topic);
	}

	/** Open on one topic, or on every topic when none is given. */
	show(topic?: string) {
		this.focus = topic && this.has(topic) ? topic : null;
		this.open = true;
	}

	showAll() {
		this.focus = null;
	}

	close() {
		this.open = false;
	}
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
