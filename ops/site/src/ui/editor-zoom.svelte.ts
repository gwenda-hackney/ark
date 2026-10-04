/**
 * An editor opening over its list: it comes forward from a distance (small,
 * soft, faint) into place while the list behind steps back, and recedes the
 * same way when it closes.
 *
 * During the move the editor shows a light placeholder, not the form: the
 * form mounts once the editor has landed, and gives way to the placeholder
 * again as it leaves, so nothing heavy is drawn while it animates.
 *
 *   const reveal = new EditorReveal();
 *   <div transition:editorZoom onintroend={reveal.introend} onoutrostart={reveal.outrostart}>
 *     {#if reveal.settled}<Editor />{:else}<EditorPlaceholder />{/if}
 *   </div>
 */
import type { TransitionConfig } from "svelte/transition";
import { prefersReducedMotion } from "./motion";

/** Quick start, long soft landing. */
function easeOutQuint(t: number): number {
	return 1 - Math.pow(1 - t, 5);
}

function easeInCubic(t: number): number {
	return t * t * t;
}

export function editorZoom(
	_node: Element,
	_params: Record<string, never> = {},
	options: { direction?: "in" | "out" | "both" } = {},
): TransitionConfig {
	if (prefersReducedMotion) return { duration: 0 };
	const out = options.direction === "out";
	// Out runs t from 1 to 0, so the same frames play backwards, a little faster.
	return {
		duration: out ? 240 : 440,
		easing: out ? easeInCubic : easeOutQuint,
		css: (t, u) =>
			`transform: scale(${(0.9 + 0.1 * t).toFixed(4)}); transform-origin: 50% 40%;` +
			` filter: blur(${(8 * u).toFixed(2)}px); opacity: ${Math.min(1, t * 1.6).toFixed(3)};`,
	};
}

/** Whether the editor has landed: the form shows then, the placeholder before and after. */
export class EditorReveal {
	settled = $state(false);

	/** `open`: the editor is already open on first render (no intro plays then). */
	constructor(open = false) {
		this.settled = open || prefersReducedMotion;
	}

	introend = () => {
		this.settled = true;
	};

	outrostart = () => {
		if (!prefersReducedMotion) this.settled = false;
	};
}
