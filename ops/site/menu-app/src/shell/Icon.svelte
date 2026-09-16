<script lang="ts">
	/**
	 * Shared thin-stroke icon set for the ops rail.
	 */
	let {
		name,
		size = 18,
		strokeWidth = 1.6,
	}: { name: string; size?: number; strokeWidth?: number } = $props();

	const icons: Record<string, string[]> = {
		home: ["M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"],
		menu: ["M4 7.5h16", "M4 12h16", "M4 16.5h16"],
		stock: [
			"M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v7A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5z",
			"M16 12h1.5",
		],
		breakeven: ["M4 19h16", "M7.5 16V9.5", "M12 16V5", "M16.5 16v-4.5"],
		cashflow: ["M3 13h4l3-8 4 14 3-6h4"],
		list: ["M8 6h13M8 12h13M8 18h13", "M3.5 6h.01M3.5 12h.01M3.5 18h.01"],
		more: [
			"M8 12a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z",
			"M13.2 12a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z",
			"M18.4 12a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z",
		],
		inventory: [
			"M4 7h16v12H4z",
			"M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7",
			"M9 12h6",
		],
		logout: [
			"M14.5 4.5h3A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5h-3",
			"M9.5 8.5 6 12l3.5 3.5",
			"M6 12h8",
		],
		refresh: ["M20 12a8 8 0 1 1-2.9-6.2", "M20 4.5v4.8h-4.8"],
		print: [
			"M7 8.5V4.5h10v4",
			"M7 15.5v4h10v-4",
			"M5 8.5h14a2 2 0 0 1 2 2v5H3v-5a2 2 0 0 1 2-2z",
			"M17.5 12.5h.01",
		],
		upload: ["M12 16V7.5", "M8.5 11 12 7.5 15.5 11", "M5 19.5h14"],
		plus: ["M12 5.5v13", "M5.5 12h13"],
		close: ["M6.5 6.5l11 11", "M17.5 6.5l-11 11"],
		/* Recipe names → guest menu description */
		"from-list": [
			"M8 6h13M8 12h13M8 18h13",
			"M3.5 6h.01M3.5 12h.01M3.5 18h.01",
			"M17 15.5v5M14.5 18h5",
		],
		trash: [
			"M5 7.5h14",
			"M9.5 7.5V5.5h5v2",
			"M8 7.5l.8 12h6.4l.8-12",
		],
		check: ["M5.5 12.5 10 17l8.5-9"],
		"x-circle": [
			"M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z",
			"M9.2 9.2l5.6 5.6",
			"M14.8 9.2l-5.6 5.6",
		],
		"chevron-left": ["M14 6l-6 6 6 6"],
		"chevron-right": ["M10 6l6 6-6 6"],
		"chevron-up": ["M6 14l6-6 6 6"],
		"chevron-down": ["M6 10l6 6 6-6"],
		undo: ["M8 5.5 4.5 9.5 8 13.5", "M4.5 9.5h8.5a5.5 5.5 0 1 1 0 11H9"],
		save: [
			"M5 4.5h11l3.5 3.5V19.5H5z",
			"M8.5 4.5v4h7v-4",
			"M8.5 19.5v-5.5h7v5.5",
		],
		search: ["M10.5 17.5a7 7 0 1 1 0-14 7 7 0 0 1 0 14z", "M15.8 15.8 20 20"],
		settings: [
			"M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
			"M19.4 13a1.6 1.6 0 0 0 .1-1l1.9-1.5-1.8-3.1-2.3.9a7 7 0 0 0-1.7-1L15 4.5h-6l-.6 2.8a7 7 0 0 0-1.7 1l-2.3-.9-1.8 3.1L4.5 12a1.6 1.6 0 0 0 .1 1l-1.9 1.5 1.8 3.1 2.3-.9a7 7 0 0 0 1.7 1l.6 2.8h6l.6-2.8a7 7 0 0 0 1.7-1l2.3.9 1.8-3.1z",
		],
		users: [
			"M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19",
			"M9.5 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
			"M20 19v-1.2a2.8 2.8 0 0 0-2.1-2.7",
			"M15.2 7.2a2.4 2.4 0 1 1 0 3.6",
		],
		pen: [
			"M14.5 5.5 18.5 9.5",
			"M5 19.5l.8-4.2L15.5 6a1.5 1.5 0 0 1 2.1 0l.4.4a1.5 1.5 0 0 1 0 2.1L8.2 18.7z",
		],
		alert: [
			"M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z",
			"M12 8v4.5",
			"M12 16.2h.01",
		],
	};

	const paths = $derived(icons[name] ?? icons.list ?? []);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#each paths as d (d)}
		<path {d} />
	{/each}
</svg>
