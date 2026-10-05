import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { InstagramDraft, InstagramSetup } from "../app/api";
import { captionLength, checkBlocker, postBlocker, postedLabel } from "./event-instagram.svelte";

const setup: InstagramSetup = { ready: true, mode: "fake", message: "", detail: "" };
const draft: InstagramDraft = {
	eventId: "1",
	date: "2026-10-08",
	nightOn: "2026-10-08",
	kind: "night",
	title: "Negroni Chess",
	imageUrl: "https://cdn.sanity.io/x.jpg",
	imageProblem: "",
	live: true,
	link: "",
	caption: "Hi",
	captionLimit: 2200,
	posts: [],
	lastPosted: null,
	posting: false,
};
const input = { draft, setup, caption: "Hi", busy: false };

describe("Instagram tab", () => {
	it("Post is ready when the night is live, with an image and a caption", () => {
		assert.equal(postBlocker(input), "");
		assert.equal(checkBlocker(input), "");
	});

	it("says why Post is disabled, without hiding it", () => {
		assert.equal(postBlocker({ ...input, draft: { ...draft, live: false } }), "Update website first");
		assert.equal(checkBlocker({ ...input, draft: { ...draft, live: false } }), "", "Check works before the website");
		assert.equal(postBlocker({ ...input, caption: " " }), "Write a caption first");
		assert.equal(postBlocker({ ...input, caption: "x".repeat(2201) }), "The caption is too long");
		assert.equal(postBlocker({ ...input, busy: true }), "Working…");
		assert.match(postBlocker({ ...input, draft: { ...draft, imageProblem: "Add an image on Details first." } }), /Add an image/);
		assert.equal(
			postBlocker({ ...input, setup: { ready: false, mode: "off", message: "Instagram isn't set up in this environment yet.", detail: "" } }),
			"Instagram isn't set up in this environment yet.",
		);
	});

	it("a post on its way doesn't block Post: pressing it again finishes that post", () => {
		assert.equal(postBlocker({ ...input, draft: { ...draft, posting: true } }), "");
	});

	it("Check has nothing to do in a dry run", () => {
		assert.match(checkBlocker({ ...input, setup: { ...setup, mode: "dry-run" } }), /Nothing is sent/);
	});

	it("counts characters as Instagram does, and labels times in London", () => {
		assert.equal(captionLength("🍸🍸"), 2);
		assert.equal(postedLabel("2026-10-05T17:02:00Z"), "5 Oct, 18:02");
		assert.equal(postedLabel(""), "");
	});
});
