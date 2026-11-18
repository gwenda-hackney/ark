import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import ShellHarness from "./fixtures/ShellHarness.svelte";

describe("EditorShell: an editor as a card over its list", () => {
	it("shows the card: head with kicker, title, subtitle and ×, the tabs, the body, and the save bar", () => {
		const { body } = render(ShellHarness, { props: {} });
		expect(body).toContain('class="editor');
		expect(body).toMatch(/class="split split--full/);
		expect(body).toMatch(/class="panel/);
		expect(body).toContain("Menu</p>");
		expect(body).toContain("Chez Pickle</h1>");
		expect(body).toContain("from 12 Nov · Wed–Sun");
		expect(body).toContain('aria-label="Close"');
		expect(body).toContain("Items · Details");
		expect(body).toMatch(/class="tab-scroll scrollbar-fade[^"]*"[^>]*>\s*<p class="body/);
		expect(body).toContain("Save menu");
		expect(body).toContain("editor-back-bar");
	});

	it("says when there are unsaved changes, on the card, the × and the save bar", () => {
		const { body } = render(ShellHarness, { props: { dirty: true } });
		expect(body).toMatch(/class="panel[^"]* dirty/);
		expect(body).toContain('aria-label="Close with unsaved changes"');
		expect(body).toContain("Unsaved changes");
	});

	it("has no tabs strip without tabs, and nothing at all when closed", () => {
		expect(render(ShellHarness, { props: { withTabs: false } }).body).not.toContain('class="tabs');
		expect(render(ShellHarness, { props: { open: false } }).body).not.toContain('class="editor');
	});
});
