/**
 * The side nav's current-page mark: one shape that moves and morphs between
 * the open rail's row wash and the collapsed rail's halo round the icon.
 *
 * The element it marks carries `data-mark`. Each frame of a move, the shape
 * re-measures where it is going (the rail and the group folds are animating
 * too) and eases toward it, so it lands on the row or icon exactly.
 */

export type MarkBox = { x: number; y: number; w: number; h: number; r: number };

/** The halo's diameter in the collapsed rail. */
const HALO = 40;
/** The open rail's row corner (--radius-md). */
const ROW_RADIUS = 8;

/** cubic-bezier(x1, y1, x2, y2) as a function of time 0..1, like CSS. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
	const bx = (s: number) => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3;
	const by = (s: number) => 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3;
	return (t) => {
		if (t <= 0) return 0;
		if (t >= 1) return 1;
		let lo = 0;
		let hi = 1;
		for (let i = 0; i < 24; i++) {
			const mid = (lo + hi) / 2;
			if (bx(mid) < t) lo = mid;
			else hi = mid;
		}
		return by((lo + hi) / 2);
	};
}

/** --ease */
export const ease = cubicBezier(0.16, 1, 0.3, 1);

export function lerpBox(a: MarkBox, b: MarkBox, p: number): MarkBox {
	const l = (x: number, y: number) => x + (y - x) * p;
	return { x: l(a.x, b.x), y: l(a.y, b.y), w: l(a.w, b.w), h: l(a.h, b.h), r: l(a.r, b.r) };
}

/** Where the mark belongs: the whole row when open, a circle on the icon when collapsed. */
export function targetBox(nav: HTMLElement, open: boolean): MarkBox | null {
	const el = nav.querySelector<HTMLElement>("[data-mark]");
	if (!el || !el.offsetParent) return null;
	const base = nav.getBoundingClientRect();
	const ox = -base.left + nav.scrollLeft;
	const oy = -base.top + nav.scrollTop;
	if (open) {
		const r = el.getBoundingClientRect();
		return { x: r.left + ox, y: r.top + oy, w: r.width, h: r.height, r: ROW_RADIUS };
	}
	const icon = (el.querySelector<HTMLElement>(".nav-icon") || el).getBoundingClientRect();
	const cx = icon.left + icon.width / 2 + ox;
	const cy = icon.top + icon.height / 2 + oy;
	return { x: cx - HALO / 2, y: cy - HALO / 2, w: HALO, h: HALO, r: HALO / 2 };
}
