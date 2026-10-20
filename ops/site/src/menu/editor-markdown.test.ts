import { describe, expect, it } from "vitest";
import { editorMarkdownToText } from "./editor-markdown";

describe("editorMarkdownToText", () => {
	it("turns the editor's entities back into the characters typed", () => {
		expect(editorMarkdownToText("Q&amp;A, Beats &amp; Samples, 3 &lt; 4 &gt; 2")).toBe(
			"Q&A, Beats & Samples, 3 < 4 > 2",
		);
		expect(editorMarkdownToText("&quot;Live&quot; at Gwenda&#39;s")).toBe(`"Live" at Gwenda's`);
	});

	it("decodes once, so a typed entity name stays readable", () => {
		expect(editorMarkdownToText("&amp;lt;")).toBe("&lt;");
	});

	it("leaves Markdown marks and escapes alone", () => {
		const text = "**Bold** and *italic*, [tickets](https://gwenda.co.uk), \\*not a mark\\*";
		expect(editorMarkdownToText(text)).toBe(text);
	});
});
