/**
 * A play application as a phone card: who, when, the decision, and any
 * email that never went out. Same words as the desktop table.
 */
import type { FormSubmission } from "../app/api";
import { decisionBadge, type BadgeSpec } from "../ui/badge";
import { formatWhen } from "../website/web-metrics";

export type FormCard = {
	id: string;
	href: string;
	title: string;
	/** Email under the name; empty when the name is the email. */
	email: string;
	form: string;
	submitted: string;
	badges: BadgeSpec[];
};

export function formCard(row: FormSubmission, opts: { showForm?: boolean } = {}): FormCard {
	const title = row.name?.trim() || row.email || "No name";
	const badges: BadgeSpec[] = [];
	const decision = decisionBadge(row.decision, row.formSlug);
	if (decision) badges.push(decision);
	if (!row.notifySentAt) badges.push({ label: "Team not told", tone: "danger" });
	if (!row.receiptSentAt) badges.push({ label: "No receipt", tone: "danger" });
	return {
		id: row.id,
		href: `/forms/${encodeURIComponent(row.id)}`,
		title,
		email: title === row.email ? "" : row.email,
		form: opts.showForm ? row.formTitle : "",
		submitted: row.submittedAt ? formatWhen(row.submittedAt) : "",
		badges,
	};
}
