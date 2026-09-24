import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	formatMethodHtml,
	htmlToMarkdown,
} from "./format-method.ts";

describe("formatMethodHtml", () => {
	it("returns empty for blank input", () => {
		assert.equal(formatMethodHtml(""), "");
		assert.equal(formatMethodHtml("  "), "");
		assert.equal(formatMethodHtml(null), "");
	});

	it("escapes HTML", () => {
		assert.equal(
			formatMethodHtml("<script>alert(1)</script>"),
			"<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
		);
	});

	it("keeps line breaks inside a paragraph", () => {
		assert.equal(
			formatMethodHtml("Shake hard\nFine strain"),
			"<p>Shake hard<br />Fine strain</p>",
		);
	});

	it("splits paragraphs on blank lines", () => {
		assert.equal(
			formatMethodHtml("Shake.\n\nServe up."),
			"<p>Shake.</p><p>Serve up.</p>",
		);
	});

	it("renders bold and italic", () => {
		assert.equal(
			formatMethodHtml("**Hard** shake, then *fine* strain"),
			"<p><strong>Hard</strong> shake, then <em>fine</em> strain</p>",
		);
	});

	it("renders bullet and numbered lists", () => {
		assert.equal(
			formatMethodHtml("- Add ice\n- Shake\n\n1. Strain\n2. Garnish"),
			"<ul><li>Add ice</li><li>Shake</li></ul><ol><li>Strain</li><li>Garnish</li></ol>",
		);
	});

	it("renders hash headings with or without a space", () => {
		assert.equal(formatMethodHtml("# Step 1"), "<h1>Step 1</h1>");
		assert.equal(formatMethodHtml("#Step 1"), "<h1>Step 1</h1>");
		assert.equal(
			formatMethodHtml("## Shake\nHard with ice"),
			"<h2>Shake</h2><p>Hard with ice</p>",
		);
		assert.equal(
			formatMethodHtml("#Step 1\nDo another thing"),
			"<h1>Step 1</h1><p>Do another thing</p>",
		);
	});
});

describe("htmlToMarkdown", () => {
	it("round-trips the light Markdown subset", () => {
		const samples = [
			"Shake hard\nFine strain",
			"Shake.\n\nServe up.",
			"**Hard** shake, then *fine* strain",
			"- Add ice\n- Shake",
			"1. Strain\n2. Garnish",
			"# Step 1\n\nDo another thing",
			"## Shake\n\nHard with ice",
		];
		for (const sample of samples) {
			const html = formatMethodHtml(sample);
			assert.equal(htmlToMarkdown(html), sample);
		}
	});

	it("inserts a blank line after a heading when none was stored", () => {
		assert.equal(
			htmlToMarkdown(formatMethodHtml("#Step 1\nDo another thing")),
			"# Step 1\n\nDo another thing",
		);
	});

	it("keeps nested paragraphs inside list items", () => {
		assert.equal(
			htmlToMarkdown("<ul><li><p>Add ice</p></li><li><p>Shake</p></li></ul>"),
			"- Add ice\n- Shake",
		);
		assert.equal(
			htmlToMarkdown("<ol><li><div>Strain</div></li><li><div>Garnish</div></li></ol>"),
			"1. Strain\n2. Garnish",
		);
	});

	it("reads Chrome contenteditable divs as paragraphs", () => {
		assert.equal(
			htmlToMarkdown("<div>Shake hard</div><div>Fine strain</div>"),
			"Shake hard\n\nFine strain",
		);
	});
});
