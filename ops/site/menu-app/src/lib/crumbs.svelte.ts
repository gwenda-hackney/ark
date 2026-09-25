/** Detail title for the shell breadcrumb. Cleared when a workbench unmounts. */

export const crumbLeaf = $state({ value: "" });

export function setCrumbLeaf(next: string) {
	crumbLeaf.value = typeof next === "string" ? next.trim() : "";
}

/**
 * Menu item to highlight when the path alone can't tell: a special event's
 * page (/events/amo-mas) looks like a series page but belongs to Schedule.
 * Cleared when the page unmounts.
 */
export const activeNavOverride = $state({ id: "" });

export function setActiveNavOverride(id: string) {
	activeNavOverride.id = typeof id === "string" ? id.trim() : "";
}
