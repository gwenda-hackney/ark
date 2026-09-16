/** Detail title for the shell breadcrumb. Cleared when a workbench unmounts. */

export const crumbLeaf = $state({ value: "" });

export function setCrumbLeaf(next: string) {
	crumbLeaf.value = typeof next === "string" ? next.trim() : "";
}
