/**
 * When a pour target field loses focus: the figure to save, or null when
 * there's nothing to do (unchanged, blank or not a percentage). Saving once
 * per blur, and only on a real change, stops the double save that change
 * plus blur used to cause.
 */
import { numberError, parseNumber } from "../ui/number-input";

export const POUR_TARGET_RULES = { min: 1, max: 100, noun: "a percentage" } as const;

export function pourTargetToSave(raw: string, saved: number): number | null {
	const n = parseNumber(raw);
	if (n === "" || n === null) return null;
	if (numberError(raw, POUR_TARGET_RULES)) return null;
	return n === saved ? null : n;
}
