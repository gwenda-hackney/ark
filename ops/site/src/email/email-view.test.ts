import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { contentsLine, previewDocument, shortDay } from "./email-view.ts";

describe("weekly email page: the preview", () => {
	it("opens the email's links in a new tab, not inside the frame", () => {
		assert.equal(
			previewDocument('<html><head lang="en"><title>x</title></head><body></body></html>'),
			'<html><head lang="en"><base target="_blank"><title>x</title></head><body></body></html>',
		);
		assert.equal(previewDocument("<p>hi</p>"), '<base target="_blank"><p>hi</p>');
	});

	it("names days the short way", () => {
		assert.equal(shortDay("2026-11-10"), "Tue 10 Nov");
		assert.equal(shortDay(""), "");
	});

	it("says what's in the email", () => {
		assert.equal(contentsLine({ nights: 2, deals: 1, kitchens: 0 }), "2 nights, 1 deal");
		assert.equal(contentsLine({ nights: 1, deals: 0, kitchens: 2 }), "1 night, 2 pop-up kitchens");
		assert.equal(contentsLine({ nights: 0, deals: 0, kitchens: 0 }), "Nothing on");
	});
});
