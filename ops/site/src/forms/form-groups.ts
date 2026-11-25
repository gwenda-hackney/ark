import type { FormSubmission } from "../app/api";
import type { GridGroup } from "../ui/grid-groups";

export type FormGroup = GridGroup<FormSubmission>;

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

