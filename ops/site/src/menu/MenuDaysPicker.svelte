<script lang="ts">
	/**
	 * The days a menu runs (#305): seven toggles, Monday first. None on, or
	 * all seven, is every day. Screen readers hear it in words; the field's
	 * hint shows them.
	 */
	import { MENU_DAYS, menuDayList, menuDaysLabel } from "./menu-days.js";
	import type { MenuDay } from "./types";

	let {
		id,
		days = $bindable([]),
		disabled = false,
	}: {
		id: string;
		/** The days it runs; [] is every day. */
		days: MenuDay[];
		disabled?: boolean;
	} = $props();

	const LABELS: Record<MenuDay, string> = {
		mon: "Mon",
		tue: "Tue",
		wed: "Wed",
		thu: "Thu",
		fri: "Fri",
		sat: "Sat",
		sun: "Sun",
	};

	function toggle(day: MenuDay) {
		const next = days.includes(day) ? days.filter((row) => row !== day) : [...days, day];
		days = menuDayList(next) as MenuDay[];
	}
</script>

<div class="days">
	<div class="chips" role="group" aria-label="Days it runs" {id}>
		{#each MENU_DAYS as day (day)}
			<button
				type="button"
				class="chip"
				class:on={days.includes(day as MenuDay)}
				aria-pressed={days.includes(day as MenuDay)}
				{disabled}
				onclick={() => toggle(day as MenuDay)}
			>
				{LABELS[day as MenuDay]}
			</button>
		{/each}
	</div>
	<span class="said" aria-live="polite">{menuDaysLabel(days)}</span>
</div>

<style>
	.days {
		position: relative;
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	/* Seven days share the row evenly, as on an event's When. */
	.chips {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: var(--space-1);
		min-width: 0;
	}

	.chip {
		min-width: 0;
		height: var(--control-h-sm);
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.chip:hover:not(:disabled) {
		background: var(--surface-3);
		color: var(--fg);
	}

	.chip:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.chip:disabled {
		cursor: default;
		opacity: 0.6;
	}

	.chip.on {
		border-color: var(--primary-border, var(--primary));
		color: var(--primary);
		background: var(--primary-wash);
	}

	/* For screen readers; the field's hint says it on screen. */
	.said {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 900px) {
		.chip {
			height: 2.75rem;
		}
	}
</style>
