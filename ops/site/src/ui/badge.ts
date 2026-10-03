/**
 * Badge tones and the status mappings that feed them. Pages keep their own
 * words; these helpers pick the colour so one state reads the same everywhere.
 */

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: readonly BadgeTone[] = ["neutral", "success", "warning", "danger", "info"];

/** Older tone names used around the app, mapped onto the five badge tones. */
const ALIASES: Record<string, BadgeTone> = {
	muted: "neutral",
	ok: "success",
	up: "success",
	live: "success",
	added: "success",
	warn: "warning",
	pending: "warning",
	waiting: "warning",
	changed: "info",
	down: "danger",
	loss: "danger",
	failed: "danger",
	removed: "danger",
	error: "danger",
};

export function toBadgeTone(tone: string | null | undefined): BadgeTone {
	const key = String(tone || "").trim().toLowerCase();
	if ((TONES as readonly string[]).includes(key)) return key as BadgeTone;
	return ALIASES[key] ?? "neutral";
}

export type BadgeSpec = { label: string; tone: BadgeTone };

/** Lightspeed match state for a menu item. Empty when the item has no POS link. */
export function posStatusBadge(status: string | null | undefined): BadgeSpec | null {
	if (status === "matched") return { label: "Match", tone: "success" };
	if (status === "mismatch") return { label: "Name mismatch", tone: "warning" };
	if (status === "missing") return { label: "Missing from POS", tone: "danger" };
	return null;
}

/** Where an inventory price comes from. Estimates are worth a second look. */
export function priceBasisTone(label: string | null | undefined): BadgeTone {
	if (label === "Item estimate") return "warning";
	if (label === "Kind estimate") return "danger";
	return "neutral";
}

/** Menu analysis issue count: critical issues are red, warnings amber. */
export function issueBadgeTone(tone: string | null | undefined): BadgeTone {
	if (tone === "loss") return "danger";
	if (tone === "down") return "warning";
	return "neutral";
}

/** A play application's decision. No decision yet on the play form means "To review". */
export function decisionBadge(decision: string | null | undefined, formSlug?: string): BadgeSpec | null {
	const value = String(decision || "").trim();
	if (value === "Approved") return { label: "Approved", tone: "success" };
	if (value === "Declined") return { label: "Declined", tone: "neutral" };
	if (value) return { label: value, tone: "info" };
	if (formSlug === "play") return { label: "To review", tone: "warning" };
	return null;
}

/** A change waiting for the website: added, changed, removed, or a stuck job. */
export function changeBadgeTone(change: string | null | undefined): BadgeTone {
	if (change === "added") return "success";
	if (change === "removed" || change === "failed") return "danger";
	if (change === "changed") return "info";
	return "neutral";
}
