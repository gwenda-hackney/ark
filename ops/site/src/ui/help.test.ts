import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import HelpHarness from "./fixtures/HelpHarness.svelte";
import { filterHelp, HelpController, parseHelpQuery } from "./help.svelte";
import type { PageHelpTopic } from "./types";
import { ITEM_HELP } from "../menu/item-help";
import { EVENTS_HELP } from "../events/events-help";
import { ARTIST_HELP } from "../artists/artist-help";
import { MENUS_HELP } from "../inventory/lightspeed-help";

const topics: PageHelpTopic[] = [
	{ title: "Name", body: "a" },
	{ title: "Price", body: "b" },
];

describe("HelpController", () => {
	it("opens on one topic, or on all of them", () => {
		const help = new HelpController(() => "Item", () => topics);
		help.show("Price");
		expect(help.open).toBe(true);
		expect(help.focus).toBe("Price");
		help.showAll();
		expect(help.focus).toBe(null);
		help.close();
		help.show();
		expect(help.focus).toBe(null);
	});

	it("shows everything when asked for a topic it doesn't have", () => {
		const help = new HelpController(() => "Item", () => topics);
		help.show("Nope");
		expect(help.open).toBe(true);
		expect(help.focus).toBe(null);
	});

	it("fills the search with the topic it opens on", () => {
		const help = new HelpController(() => "Item", () => topics);
		help.show("Price");
		expect(help.query).toBe("field:Price");
		help.showAll();
		expect(help.query).toBe("");
	});
});

describe("parseHelpQuery", () => {
	it("splits field: from free text", () => {
		expect(parseHelpQuery("  ")).toEqual({});
		expect(parseHelpQuery("field: Series name ")).toEqual({ field: "Series name" });
		expect(parseHelpQuery("pour cost")).toEqual({ text: "pour cost" });
	});
});

describe("filterHelp", () => {
	const list: PageHelpTopic[] = [
		{ title: "Series name", body: "The series." },
		{ title: "Notes", body: "Shown under the name." },
		{ title: "Name", body: "What it is called." },
		{ title: "Price", body: "Pounds." },
	];

	it("keeps everything for an empty query", () => {
		expect(filterHelp(list, "  ")).toEqual(list);
	});

	it("puts the exact title first, then titles, then text", () => {
		expect(filterHelp(list, "name").map((t) => t.title)).toEqual(["Name", "Series name", "Notes"]);
	});

	it("drops topics that don't match", () => {
		expect(filterHelp(list, "zzz")).toEqual([]);
	});

	it("field: looks only at titles, from the start", () => {
		expect(filterHelp(list, "field:name").map((t) => t.title)).toEqual(["Name"]);
		expect(filterHelp(list, "Field: Series name").map((t) => t.title)).toEqual(["Series name"]);
		expect(filterHelp(list, "field:n").map((t) => t.title)).toEqual(["Notes", "Name"]);
		expect(filterHelp(list, "field:")).toEqual(list);
	});
});

describe("Field help", () => {
	it("puts a ? button beside the label that names its topic", () => {
		const body = render(HelpHarness, { props: { help: "Price" } }).body;
		expect(body).toMatch(/<button[^>]*aria-label="Help: Price"/);
		expect(body).toContain("<svg");
		expect(body).not.toContain('role="tooltip"');
	});

	it("shows no ? without a Help drawer or a matching topic", () => {
		expect(render(HelpHarness, { props: { help: "Price", provide: false } }).body).not.toContain("Help: Price");
		expect(render(HelpHarness, { props: { help: "Cost" } }).body).not.toContain("Help: ");
	});
});

/** Every quoted `help="…"` / `topic="…"` name in a folder's components. */
function helpNames(dir: string): string[] {
	const names: string[] = [];
	const walk = (d: string) => {
		for (const name of readdirSync(d)) {
			const path = join(d, name);
			if (statSync(path).isDirectory()) walk(path);
			else if (name.endsWith(".svelte")) {
				const src = readFileSync(path, "utf8");
				for (const m of src.matchAll(/\b(?:help|topic)=(?:"([^"]+)"|\{([^}]*)\})/g)) {
					if (m[1]) names.push(m[1]);
					else for (const q of m[2].matchAll(/"([^"]+)"/g)) names.push(q[1]);
				}
			}
		}
	};
	walk(dir);
	return names;
}

describe("help topics", () => {
	const root = join(__dirname, "..");
	it.each([
		["menu", ITEM_HELP],
		["events", EVENTS_HELP],
		["artists", ARTIST_HELP],
		["inventory", MENUS_HELP],
	] as const)("every ? in %s opens a topic its drawer has", (dir, list) => {
		const titles = new Set(list.map((t) => t.title));
		const names = helpNames(join(root, dir));
		expect(names.length).toBeGreaterThan(0);
		expect(names.filter((n) => !titles.has(n))).toEqual([]);
	});
});
