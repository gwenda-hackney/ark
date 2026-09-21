<script lang="ts">
	import { Segmented } from "../../ui";
	import type { SegmentedItem } from "../../ui/types";

	let { view }: { view: "reconcile" | "export" } = $props();

	const items: SegmentedItem[] = [
		{ id: "reconcile", label: "Reconcile", href: "/lightspeed" },
		{ id: "export", label: "Export", href: "/lightspeed/export" },
	];
</script>

<Segmented {items} value={view} size="sm" ariaLabel="Lightspeed pages" />
