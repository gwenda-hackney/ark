/**
 * Pour target figures as typed against what's saved: one figure
 * (`pourTargetToSave`: the number to save, or null for unchanged, blank or
 * not a percentage), or the whole form for its one Save (`pourTargetDraft`).
 */
import { numberError, parseNumber } from "../ui/number-input";

export const POUR_TARGET_RULES = { min: 1, max: 100, noun: "a percentage" } as const;

export function pourTargetToSave(raw: string, saved: number): number | null {
	const n = parseNumber(raw);
	if (n === "" || n === null) return null;
	if (numberError(raw, POUR_TARGET_RULES)) return null;
	return n === saved ? null : n;
}

/**
 * The whole form at once, for its one Save: what changed (`changes`), what
 * can't be saved as typed (`errors`, by drink type), and whether anything
 * differs from what's saved (`dirty`, including a figure that's wrong).
 */
export function pourTargetDraft<T extends string>(
	draft: Record<T, string>,
	saved: Record<T, number>,
): { changes: Partial<Record<T, number>>; errors: Partial<Record<T, string>>; dirty: boolean } {
	const changes: Partial<Record<T, number>> = {};
	const errors: Partial<Record<T, string>> = {};
	let dirty = false;
	for (const key of Object.keys(saved) as T[]) {
		const raw = String(draft[key] ?? "").trim();
		const n = parseNumber(raw);
		if (n === saved[key]) continue;
		dirty = true;
		const problem = raw ? numberError(raw, POUR_TARGET_RULES) : "Add a target.";
		if (problem || typeof n !== "number") errors[key] = problem || "Add a target.";
		else changes[key] = n;
	}
	return { changes, errors, dirty };
}
