<script lang="ts">
	/** What can go where a + was pressed in the email (#348): big choices, each saying what it is. */
	import { Dialog } from "../ui";
	import { SECTION_CHOICES, type SectionKind } from "./one-off-view";

	let { open, onclose, onchoose }: { open: boolean; onclose: () => void; onchoose: (kind: SectionKind) => void } = $props();
</script>

<Dialog {open} size="lg" title="Add something here" {onclose}>
	<div class="choices" role="group" aria-label="What to add">
		{#each SECTION_CHOICES as choice (choice.kind)}
			<button type="button" class="choice" onclick={() => onchoose(choice.kind)}>
				<span class="name">{choice.label}</span>
				<span class="about">{choice.about}</span>
			</button>
		{/each}
	</div>
</Dialog>

<style>
	.choices {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: var(--space-2);
	}
	.choice {
		display: grid;
		gap: 0.2rem;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--card);
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.choice:hover,
	.choice:focus-visible {
		border-color: var(--primary);
	}
	.name {
		font-weight: 600;
	}
	.about {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
</style>
