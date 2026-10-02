/** Soft settle. Matches theme `--ease`. */
export function easeOut(t: number): number {
	return 1 - Math.pow(1 - t, 3.2);
}

export const prefersReducedMotion =
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const fadeMs = prefersReducedMotion ? 0 : 180;
export const flyMs = prefersReducedMotion ? 0 : 320;
