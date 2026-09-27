/**
 * Portal node to document.body so fixed overlays escape transformed parents.
 */
export function portal(node: HTMLElement) {
	const parent = document.body;
	parent.appendChild(node);
	return {
		destroy() {
			if (node.parentNode === parent) parent.removeChild(node);
		},
	};
}
