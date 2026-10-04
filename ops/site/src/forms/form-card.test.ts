import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { FormSubmission } from "../app/api";
import { formCard } from "./form-card";

function row(extra: Partial<FormSubmission> = {}): FormSubmission {
	return {
		id: "sub 1",
		formSlug: "play",
		formTitle: "Play at Gwenda",
		email: "dj@example.com",
		name: "DJ Vbrave",
		status: "",
		decision: "",
		artistName: "",
		artistLink: "",
		submitted: null,
		submittedAt: "",
		current: true,
		notifySentAt: "2026-10-01T10:00:00Z",
		receiptSentAt: "2026-10-01T10:00:00Z",
		answers: [],
		...extra,
	};
}

describe("play application card", () => {
	it("shows the person, their email and the decision", () => {
		const card = formCard(row());
		assert.equal(card.href, "/forms/sub%201");
		assert.equal(card.title, "DJ Vbrave");
		assert.equal(card.email, "dj@example.com");
		assert.equal(card.form, "");
		assert.equal(card.submitted, "");
		assert.deepEqual(card.badges, [{ label: "To review", tone: "warning" }]);
	});

	it("falls back to the email and names the form when asked", () => {
		const card = formCard(row({ name: " ", decision: "Approved" }), { showForm: true });
		assert.equal(card.title, "dj@example.com");
		assert.equal(card.email, "");
		assert.equal(card.form, "Play at Gwenda");
		assert.deepEqual(card.badges, [{ label: "Approved", tone: "success" }]);
	});

	it("flags emails that never went out", () => {
		const card = formCard(row({ notifySentAt: "", receiptSentAt: "", decision: "Declined" }));
		assert.deepEqual(
			card.badges.map((badge) => badge.label),
			["Declined", "Team not told", "No receipt"],
		);
	});
});
