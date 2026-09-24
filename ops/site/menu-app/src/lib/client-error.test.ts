import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeClientError } from "./client-error.ts";

describe("normalizeClientError", () => {
	it("reads Error instances", () => {
		const err = new Error("boom");
		err.name = "TypeError";
		const report = normalizeClientError(err);
		assert.equal(report.message, "boom");
		assert.equal(report.name, "TypeError");
		assert.match(report.stack, /boom/);
	});

	it("reads plain strings", () => {
		assert.deepEqual(normalizeClientError("  nope  "), {
			message: "nope",
			stack: "",
			name: "Error",
		});
	});

	it("reads message-shaped objects", () => {
		const report = normalizeClientError({
			message: "each_key_duplicate",
			stack: "at EventsPage",
			name: "Error",
		});
		assert.equal(report.message, "each_key_duplicate");
		assert.equal(report.stack, "at EventsPage");
	});
});
