import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { leadPicture } from "./email-view";
import {
	addSection,
	draftOf,
	editorSections,
	moveSection,
	notReady,
	oneOffSendBlocked,
	oneOffTestBlocked,
	previewOf,
	removeSection,
	sameDraft,
	statusBadge,
	writePath,
} from "./one-off-view";
import type { EmailFrame } from "./email-api";

const frame: EmailFrame = {
	site: {
		origin: "https://gwenda.co.uk",
		name: "Gwenda",
		social: "Social",
		instagram: "https://instagram.com/gwenda",
		whatsOn: "https://gwenda.co.uk/whats-on",
		mapsUrl: "https://maps.example",
		address: "Hackney Wick",
	},
	images: { projectId: "p", dataset: "production" },
};

describe("the one-off email editor (#348)", () => {
	it("adds blank sections at the end, each with its own key", () => {
		let list = addSection([], "heading");
		list = addSection(list, "button");
		assert.deepEqual(
			list.map((entry) => entry.section),
			[
				{ kind: "heading", text: "" },
				{ kind: "button", label: "", link: "", look: "link" },
			],
		);
		assert.notEqual(list[0].key, list[1].key);
	});

	it("moves a section up or down, and not past either end", () => {
		const list = editorSections([
			{ kind: "heading", text: "A" },
			{ kind: "copy", text: "B" },
			{ kind: "copy", text: "C" },
		]);
		const text = (l: typeof list) => l.map((entry) => ("text" in entry.section ? entry.section.text : ""));
		assert.deepEqual(text(moveSection(list, 2, -1)), ["A", "C", "B"]);
		assert.deepEqual(text(moveSection(list, 0, 1)), ["B", "A", "C"]);
		assert.equal(moveSection(list, 0, -1), list);
		assert.equal(moveSection(list, 2, 1), list);
		assert.deepEqual(text(removeSection(list, 1)), ["A", "C"]);
		// Keys follow their sections.
		assert.equal(moveSection(list, 2, -1)[1].key, list[2].key);
	});

	it("knows when there's something to save", () => {
		const list = editorSections([{ kind: "copy", text: "Hi" }]);
		const saved = draftOf("", "NYE", "", list);
		assert.equal(sameDraft(saved, draftOf("", "NYE", "", list)), true);
		assert.equal(sameDraft(saved, draftOf("", "NYE!", "", list)), false);
		assert.equal(sameDraft(saved, draftOf("", "NYE", "", addSection(list, "image"))), false);
	});

	it("previews the draft between the logo and the foot", () => {
		const { html } = previewOf(draftOf("", "NYE", "Doors at 9", editorSections([{ kind: "heading", text: "Party" }])), frame);
		assert.ok(html.indexOf("logo-email-social.png") < html.indexOf(">Party<"));
		assert.ok(html.indexOf(">Party<") < html.indexOf("*|UNSUB|*"));
	});

	it("says why a test can't go yet", () => {
		const ok = { saved: true, dirty: false, mailchimp: true, signedIn: true, notReady: "" };
		assert.equal(oneOffTestBlocked(ok), "");
		assert.equal(oneOffTestBlocked({ ...ok, dirty: true }), "Save first");
		assert.equal(oneOffTestBlocked({ ...ok, saved: false }), "Save first");
		assert.equal(oneOffTestBlocked({ ...ok, mailchimp: false }), "Mailchimp not connected here");
		assert.equal(oneOffTestBlocked({ ...ok, notReady: "Give it a subject first" }), "Give it a subject first");
		assert.equal(notReady(draftOf("", "", "", [])), "Give it a subject first.");
		assert.equal(notReady(draftOf("", "Hi", "", editorSections([{ kind: "image", assetId: "", alt: "" }]))), "Add something to it first.");
	});

	it("names statuses and paths", () => {
		assert.deepEqual(statusBadge("sent"), { label: "Sent", tone: "success" });
		assert.deepEqual(statusBadge("draft"), { label: "Draft", tone: "neutral" });
		assert.equal(writePath(), "/email");
		assert.equal(writePath(3), "/email/write/3");
	});
});

describe("leadPicture", () => {
	it("takes the first picture after the logo, or none", () => {
		const html = '<img src="https://x/logo.png" alt="Gwenda"><h2>Hi</h2><img src="https://cdn.sanity.io/a.jpg?w=1120&amp;fit=max"><img src="https://x/b.jpg">';
		assert.equal(leadPicture(html), "https://cdn.sanity.io/a.jpg?w=1120&fit=max");
		assert.equal(leadPicture('<img src="https://x/logo.png">'), "");
		assert.equal(leadPicture(""), "");
	});

	it("says why Send to the list can't be pressed: production, admins, saved, ready, not sent", () => {
		const ok = { status: "draft" as const, saved: true, dirty: false, audience: true, admin: true, notReady: "" };
		assert.equal(oneOffSendBlocked(ok), "");
		assert.equal(oneOffSendBlocked({ ...ok, audience: false }), "Only production ops sends to the list");
		assert.equal(oneOffSendBlocked({ ...ok, admin: false }), "Admins only");
		assert.equal(oneOffSendBlocked({ ...ok, dirty: true }), "Save first");
		assert.equal(oneOffSendBlocked({ ...ok, notReady: "Give it a subject first." }), "Give it a subject first.");
		assert.equal(oneOffSendBlocked({ ...ok, status: "sent" }), "Already sent");
		assert.equal(oneOffSendBlocked({ ...ok, status: "failed" }), "", "one that didn't send can go again");
	});
});
