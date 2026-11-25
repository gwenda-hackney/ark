import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { FormSubmission } from "../app/api";
import { groupByForm, keepUnderHeadings, withHeadings } from "./form-groups";

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

describe("withHeadings and keepUnderHeadings", () => {
	const groups = groupByForm([row("1", "play", "Play at Gwenda"), row("2", "party", "Christmas parties"), row("3", "play", "Play at Gwenda")]);

	it("lists each form's heading, with its count, then its enquiries", () => {
		assert.deepEqual(
			withHeadings(groups).map((item) => (item.kind === "group" ? `# ${item.title} ${item.count}` : item.id)),
			["# Christmas parties 1", "2", "# Play at Gwenda 2", "1", "3"],
		);
	});

	it("a sort by a column keeps every enquiry under its own heading, sorted within it", () => {
		const nodes = withHeadings(groups).map((data) => ({ data }));
		// A column sort mixes them up: 3, then 1, with headings anywhere.
		const sorted = [nodes[4], nodes[2], nodes[1], nodes[3], nodes[0]];
		keepUnderHeadings(sorted);
		assert.deepEqual(
			sorted.map(({ data }) => (data.kind === "group" ? `# ${data.title}` : data.id)),
			["# Christmas parties", "2", "# Play at Gwenda", "3", "1"],
		);
	});
});
