<script lang="ts">
	/**
	 * A section's head on a menu's page, as the website shows it: its name,
	 * and the line under it when it has one, both changed where they are
	 * (InlineEdit). Beside it, a handle to drag it among its siblings (arrow
	 * keys move it too) and a ⋯ menu: move up or down, add a line, add a
	 * group, move to another menu, remove. On desktop the handle and ⋯ fade
	 * from dim to full on hover or focus (always there, so it is plain a section
	 * can be dragged); their room is always kept, so nothing moves. A
	 * phone has no hover, so there they always show.
	 */
	import { InlineEdit, OverflowMenu, type OverflowItem } from "../ui";
	import { Icon } from "../app/shell";

	let {
		title,
		subtitle,
		level,
		index,
		count,
		busy = false,
		extra = [],
		ongrab,
		onmove,
		onrename,
		onsubtitle,
		onremove,
	}: {
		title: string;
		subtitle: string;
		level: "chapter" | "group";
		/** Its place among its siblings, and how many there are. */
		index: number;
		count: number;
		busy?: boolean;
		/** More ⋯ actions for a chapter: Add group, Move to another menu. */
		extra?: OverflowItem[];
		ongrab: (event: PointerEvent) => void;
		onmove: (dir: -1 | 1) => void;
		onrename: (title: string) => Promise<void>;
		onsubtitle: (subtitle: string) => Promise<void>;
		onremove: () => void;
	} = $props();

	let editingSubtitle = $state(false);
	const what = $derived(level === "chapter" ? "section" : "group");

	const actions = $derived<OverflowItem[]>([
		{ label: "Move up", disabled: busy || index === 0, reason: index === 0 ? "Already first" : undefined, onselect: () => onmove(-1) },
		{
			label: "Move down",
			disabled: busy || index === count - 1,
			reason: index === count - 1 ? "Already last" : undefined,
			onselect: () => onmove(1),
		},
		{
			label: "Add a line under it",
			disabled: Boolean(subtitle),
			reason: subtitle ? "It has one: click it to change it" : undefined,
			onselect: () => (editingSubtitle = true),
		},
		...extra,
		{ label: `Remove ${what}`, tone: "destructive", disabled: busy, onselect: onremove },
	]);

	function onhandlekey(event: KeyboardEvent) {
		if (event.key === "ArrowUp" && index > 0) {
			event.preventDefault();
			onmove(-1);
		} else if (event.key === "ArrowDown" && index < count - 1) {
			event.preventDefault();
			onmove(1);
		}
	}
</script>

<div class="head {level}">
	<button
		type="button"
		class="handle"
		aria-label={`Move ${title}: drag it, or press the up and down arrows`}
		title="Drag to move"
		disabled={busy || count < 2}
		onpointerdown={ongrab}
		onkeydown={onhandlekey}
	>
		<Icon name="grip" size={16} />
	</button>
	<div class="text">
		<svelte:element this={level === "chapter" ? "h3" : "h4"} class="name">
			<InlineEdit value={title} label={`${level === "chapter" ? "Section" : "Group"} name`} required disabled={busy} onsave={onrename} />
		</svelte:element>
		{#if subtitle || editingSubtitle}
			<div class="note">
				<InlineEdit
					value={subtitle}
					label="Line under it"
					placeholder="A line under it, e.g. Served with fries"
					disabled={busy}
					bind:editing={editingSubtitle}
					onsave={onsubtitle}
				/>
			</div>
		{/if}
	</div>
	<div class="more">
		<OverflowMenu items={actions} label={`More for ${title}`} />
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
	}

	.text {
		flex: 1;
		min-width: 0;
	}

	.name {
		margin: 0;
	}

	.chapter .name {
		font-family: var(--font);
		font-size: var(--text-base);
		font-weight: 600;
		line-height: var(--leading-base);
	}

	.group .name {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
		line-height: 1.6;
	}

	.note {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--fg-muted);
	}

	.handle {
		flex-shrink: 0;
		display: inline-grid;
		place-items: center;
		width: 1.5rem;
		height: 1.75rem;
		margin-left: calc(var(--space-1) * -1);
		padding: 0;
		border: 0;
		border-radius: var(--radius-md);
		background: none;
		color: var(--fg-muted);
		cursor: grab;
		touch-action: none;
		/* Always there, quietly, so it's plain a section can be dragged */
		opacity: 0.5;
		transition:
			opacity var(--t-fast, 120ms) ease,
			background var(--t-fast, 120ms) ease;
	}

	.handle:active {
		cursor: grabbing;
	}

	.handle:disabled {
		cursor: default;
		opacity: 0;
	}

	.handle:hover:not(:disabled) {
		background: var(--surface-3);
		color: var(--fg);
	}

	.handle:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
	}

	/* A quiet ⋯ beside the name, not a boxed button. */
	.more :global(.trigger) {
		border-color: transparent;
		background: none;
	}

	.more {
		flex-shrink: 0;
		opacity: 0.5;
		transition: opacity var(--t-fast, 120ms) ease;
	}

	/* Brightens on hover or focus, and the section's head lights up as the
	   thing that moves. */
	.head:has(.handle:not(:disabled)):hover {
		border-radius: var(--radius-md);
		background: var(--surface-2, rgb(255 255 255 / 0.03));
	}

	.head:hover .handle:not(:disabled),
	.head:focus-within .handle:not(:disabled),
	.head:hover .more,
	.head:focus-within .more,
	.more:has(:global([aria-expanded="true"])) {
		opacity: 1;
	}

	/* A phone has no hover: they always show. */
	@media (hover: none) {
		.handle:not(:disabled),
		.more {
			opacity: 1;
		}
	}
</style>
