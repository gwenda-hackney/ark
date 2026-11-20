// @vitest-environment jsdom
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { copyInlineHtml, paragraphs } from "../../../../shared/email/sections.js";
import { copyFromDom, headingFromDom, linkAddress } from "./copy-dom";

const cell = (html: string) => {
	const td = document.createElement("td");
	td.innerHTML = html;
	return td;
};

describe("words typed in the preview, back into the email", () => {
	it("each paragraph is one, with **bold** and [links](…) as the email stores them", () => {
		const td = cell('<p>Doors at <strong style="font-weight:700">9</strong>.</p><p>See <a href="https://gwenda.co.uk/whats-on">what\'s on</a>.</p>');
		assert.equal(copyFromDom(td), "Doors at **9**.\n\nSee [what's on](https://gwenda.co.uk/whats-on).");
	});

	it("what the email draws comes back exactly as it was stored", () => {
		const stored = "Come **hungry**, bring your mates.\n\nBook [here](https://gwenda.co.uk) or call.\nWe're open late.";
		const td = cell(paragraphs(stored).map((part) => `<p>${copyInlineHtml(part)}</p>`).join(""));
		assert.equal(copyFromDom(td), stored);
	});

	it("what the browser makes while typing: <b>, a <div> for Enter, <br>, &nbsp; and spare spaces", () => {
		const td = cell("<p>One&nbsp; <b>two </b>three</p><div>Four<br>five<br></div><p><br></p>");
		assert.equal(copyFromDom(td), "One **two** three\n\nFour\nfive");
	});

	it("words typed straight into the cell, before any paragraph, are a paragraph too", () => {
		assert.equal(copyFromDom(cell("Hello<p>Next</p>")), "Hello\n\nNext");
	});

	it("bold set by style, bold inside a link and a link inside bold", () => {
		assert.equal(copyFromDom(cell('<p><span style="font-weight: 700">Big</span> news</p>')), "**Big** news");
		assert.equal(copyFromDom(cell('<p><a href="https://a.co"><b>Tap</b> here</a></p>')), "[Tap here](https://a.co)");
		assert.equal(copyFromDom(cell('<p><b>Read <a href="https://a.co">this</a></b></p>')), "**Read [this](https://a.co)**");
	});

	it("the editor's own marks in the cell (a drag grip) are never words", () => {
		assert.equal(copyFromDom(cell('<span data-ops="" contenteditable="false">⠿</span><p>Doors at 9.</p>')), "Doors at 9.");
	});

	it("nothing typed is no copy", () => {
		assert.equal(copyFromDom(cell("<p><br></p>")), "");
	});

	it("a heading is one line of plain words", () => {
		const h2 = document.createElement("h2");
		h2.innerHTML = "New&nbsp;Year's <b>Eve</b>\n";
		assert.equal(headingFromDom(h2), "New Year's Eve");
	});
});

describe("an address typed for a link", () => {
	it("a web address, with https:// added when it's left off", () => {
		assert.equal(linkAddress("gwenda.co.uk/whats-on"), "https://gwenda.co.uk/whats-on");
		assert.equal(linkAddress(" https://www.opentable.co.uk/r/gwenda "), "https://www.opentable.co.uk/r/gwenda");
	});

	it("an email address becomes mailto:", () => {
		assert.equal(linkAddress("hello@gwenda.co.uk"), "mailto:hello@gwenda.co.uk");
	});

	it("anything else isn't one", () => {
		assert.equal(linkAddress(""), "");
		assert.equal(linkAddress("not a link"), "");
		assert.equal(linkAddress("gwenda"), "");
		assert.equal(linkAddress("javascript:alert(1)"), "");
	});
});
