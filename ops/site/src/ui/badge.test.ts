import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	changeBadgeTone,
	decisionBadge,
	issueBadgeTone,
	posStatusBadge,
	priceBasisTone,
	toBadgeTone,
} from "./badge";

describe("badge tones", () => {
	it("keeps the five tones and maps older names onto them", () => {
		for (const tone of ["neutral", "success", "warning", "danger", "info"]) {
			assert.equal(toBadgeTone(tone), tone);
		}
		assert.equal(toBadgeTone("muted"), "neutral");
		assert.equal(toBadgeTone("live"), "success");
		assert.equal(toBadgeTone("warn"), "warning");
		assert.equal(toBadgeTone("loss"), "danger");
		assert.equal(toBadgeTone("Danger"), "danger");
		assert.equal(toBadgeTone(""), "neutral");
		assert.equal(toBadgeTone(undefined), "neutral");
		assert.equal(toBadgeTone("something-new"), "neutral");
	});

	it("POS: a match is good, a wrong name needs a look, missing is a problem", () => {
		assert.deepEqual(posStatusBadge("matched"), { label: "Match", tone: "success" });
		assert.deepEqual(posStatusBadge("mismatch"), { label: "Name mismatch", tone: "warning" });
		assert.deepEqual(posStatusBadge("missing"), { label: "Missing from POS", tone: "danger" });
		assert.equal(posStatusBadge(""), null);
		assert.equal(posStatusBadge(undefined), null);
	});

	it("inventory price basis: trade is plain, estimates stand out", () => {
		assert.equal(priceBasisTone("Trade"), "neutral");
		assert.equal(priceBasisTone("Item estimate"), "warning");
		assert.equal(priceBasisTone("Kind estimate"), "danger");
	});

	it("menu issues: critical red, warnings amber, none plain", () => {
		assert.equal(issueBadgeTone("loss"), "danger");
		assert.equal(issueBadgeTone("down"), "warning");
		assert.equal(issueBadgeTone(""), "neutral");
	});

	it("play decisions, with To review for an undecided play form", () => {
		assert.deepEqual(decisionBadge("Approved"), { label: "Approved", tone: "success" });
		assert.deepEqual(decisionBadge("Declined"), { label: "Declined", tone: "neutral" });
		assert.deepEqual(decisionBadge("", "play"), { label: "To review", tone: "warning" });
		assert.equal(decisionBadge("", "contact"), null);
		assert.deepEqual(decisionBadge("Maybe"), { label: "Maybe", tone: "info" });
	});

	it("website changes: added, changed, removed", () => {
		assert.equal(changeBadgeTone("added"), "success");
		assert.equal(changeBadgeTone("changed"), "info");
		assert.equal(changeBadgeTone("removed"), "danger");
		assert.equal(changeBadgeTone("failed"), "danger");
		assert.equal(changeBadgeTone("waiting"), "neutral");
	});
});
