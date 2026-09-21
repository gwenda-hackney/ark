<script lang="ts">
	import { Segmented } from "../../ui";
	import type { SegmentedItem } from "../../ui/types";

	let { view }: { view: "reconcile" | "export" | "menus" } = $props();

	const items: SegmentedItem[] = [
		{ id: "reconcile", label: "Reconcile", href: "/lightspeed" },
		{ id: "export", label: "Export", href: "/lightspeed/export" },
		{ id: "menus", label: "Menus", href: "/lightspeed/menus" },
	];
</script>

<Segmented {items} value={view} size="sm" ariaLabel="Lightspeed pages" />
