import type { FormSubmission } from "../app/api";

export type FormGroup = { key: string; title: string; rows: FormSubmission[] };

/**
 * Enquiries by the form they came through (play applications, party
 * enquiries…), A to Z by the form's name; each keeps the rows' order.
 */
export function groupByForm(rows: FormSubmission[]): FormGroup[] {
	const groups = new Map<string, FormGroup>();
	for (const row of rows) {
		const key = row.formSlug || row.formTitle || "form";
		let group = groups.get(key);
		if (!group) {
			group = { key, title: row.formTitle || row.formSlug || "Form", rows: [] };
			groups.set(key, group);
		}
		group.rows.push(row);
	}
	return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** A form's heading row in the one Enquiries table: its name and how many. */
export type GroupHeading = { kind: "group"; id: string; groupKey: string; order: number; title: string; count: number };
/** An enquiry row in that table, knowing which heading it sits under. */
export type GroupedEnquiry = FormSubmission & { kind: "row"; groupKey: string; order: number };
export type GroupedRow = GroupHeading | GroupedEnquiry;

/** The groups as one list for one table: each form's heading row, then its enquiries. */
export function withHeadings(groups: FormGroup[]): GroupedRow[] {
	return groups.flatMap((group, order): GroupedRow[] => [
		{ kind: "group", id: `group:${group.key}`, groupKey: group.key, order, title: group.title, count: group.rows.length },
		...group.rows.map((row): GroupedEnquiry => ({ ...row, kind: "row", groupKey: group.key, order })),
	]);
}

/**
 * After the table sorts by a column, put each enquiry back under its own
 * form's heading (forms keep their order; the sort holds inside each form).
 * Sorts in place, as the table's postSortRows wants.
 */
export function keepUnderHeadings<T extends { data?: GroupedRow }>(nodes: T[]): void {
	const rank = new Map(nodes.map((node, index) => [node, index]));
	nodes.sort((a, b) => {
		const left = a.data;
		const right = b.data;
		if (!left || !right) return 0;
		if (left.order !== right.order) return left.order - right.order;
		if (left.kind !== right.kind) return left.kind === "group" ? -1 : 1;
		return (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
	});
}
