import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { FormSubmission } from "../app/api";
import { groupByForm } from "./form-groups";

const row = (id: string, formSlug: string, formTitle: string) => ({ id, formSlug, formTitle }) as FormSubmission;

describe("groupByForm", () => {
	it("puts each enquiry under its form, forms A to Z, rows in the order given", () => {
		const groups = groupByForm([
			row("1", "play", "Play at Gwenda"),
			row("2", "party", "Christmas parties"),
			row("3", "play", "Play at Gwenda"),
			row("4", "", "Old form"),
		]);
		assert.deepEqual(
			groups.map((group) => [group.title, group.rows.map((item) => item.id)]),
			[
				["Christmas parties", ["2"]],
				["Old form", ["4"]],
				["Play at Gwenda", ["1", "3"]],
			],
		);
	});

	it("has no groups without enquiries", () => {
		assert.deepEqual(groupByForm([]), []);
	});
});
