/** Phone / small-tablet portrait. Keep in sync with `@media (max-width: 900px)` in CSS. */
export const SHELL_MOBILE_MAX_PX = 900;
export const SHELL_MOBILE_QUERY = `(max-width: ${SHELL_MOBILE_MAX_PX}px)`;

/** Live `matchMedia` flag. Call from a component so the effect is owned. */
export function mediaMatches(query: string) {
	let matches = $state(
		typeof window !== "undefined" ? window.matchMedia(query).matches : false,
	);

	$effect(() => {
		if (typeof window === "undefined") return;
		const mq = window.matchMedia(query);
		matches = mq.matches;
		const onChange = () => {
			matches = mq.matches;
		};
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	});

	return {
		get matches() {
			return matches;
		},
	};
}
