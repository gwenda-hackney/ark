<script lang="ts">
	/**
	 * The bar over the email in the one-off editor (#348): always the same two
	 * rows, so nothing jumps. The first names what's picked in the email and
	 * moves or removes it; the second is what that part needs: Bold and Link
	 * for words (WordsToolbar), a picture's Change picture, size and
	 * description, a button's words, address and look; or, after a + in the
	 * email, the parts that can go there.
	 */
	import { Button, Field, Segmented, TextField } from "../ui";
	import { Icon } from "../app/shell";
	import type { OneOffSection } from "./email-api";
	import { BUTTON_LOOK_ITEMS, IMAGE_SIZE_ITEMS, SECTION_CHOICES, partName, type SectionKind } from "./one-off-view";
	import type { WordsFocus } from "./preview-editing";
	import WordsToolbar from "./WordsToolbar.svelte";

	let {
		doc,
		words,
		editable,
		linking = $bindable(false),
		section,
		index,
		count,
		inserting,
		uploading,
		onmove,
		onremove,
		onchange,
		onchoose,
		oncancel,
		onpicture,
	}: {
		doc: Document | null;
		words: WordsFocus | null;
		editable: boolean;
		linking?: boolean;
		/** The part picked in the email, or null. */
		section: OneOffSection | null;
		index: number;
		count: number;
		/** A + was pressed: the place a new part would go, or null. */
		inserting: number | null;
		uploading: boolean;
		onmove: (by: -1 | 1) => void;
		onremove: () => void;
		/** Fields of the picked part changed. */
		onchange: (patch: Partial<OneOffSection>) => void;
		/** A kind was chosen for the + . */
		onchoose: (kind: SectionKind) => void;
		oncancel: () => void;
		/** Change picture was pressed. */
		onpicture: () => void;
	} = $props();

	const kind = $derived(section?.kind ?? null);
	const title = $derived(
		inserting !== null ? "Add something here" : section ? `${partName(section.kind)} · ${index + 1} of ${count}` : "Nothing picked",
	);
	const none = $derived(!editable || !section || inserting !== null);
	const keep = (event: MouseEvent) => event.preventDefault();
</script>

<div class="edit-bar" role="toolbar" aria-label="Change the email">
	<div class="part-row">
		<p class="title">{title}</p>
		<div class="moves">
			<Button variant="outline" size="sm" disabled={none || index <= 0} reason={none ? "Pick a part of the email first" : "It's first"} onmousedown={keep} onclick={() => onmove(-1)}>
				{#snippet icon()}<Icon name="chevron-up" size={16} />{/snippet}Move up
			</Button>
			<Button variant="outline" size="sm" disabled={none || index >= count - 1} reason={none ? "Pick a part of the email first" : "It's last"} onmousedown={keep} onclick={() => onmove(1)}>
				{#snippet icon()}<Icon name="chevron-down" size={16} />{/snippet}Move down
			</Button>
			<Button variant="outline" size="sm" disabled={none} reason="Pick a part of the email first" onmousedown={keep} onclick={onremove}>
				{#snippet icon()}<Icon name="trash" size={16} />{/snippet}Remove
			</Button>
		</div>
	</div>

	<div class="panel">
		{#if !editable}
			<p class="hint">Sent or scheduled: it can't be changed.</p>
		{:else if inserting !== null}
			<div class="choices" role="group" aria-label="What to add">
				{#each SECTION_CHOICES as choice (choice.kind)}
					<button type="button" class="choice" onclick={() => onchoose(choice.kind)}>
						<span class="choice-name">{choice.label}</span>
						<span class="choice-about">{choice.about}</span>
					</button>
				{/each}
			</div>
			<div><Button variant="ghost" size="sm" onclick={oncancel}>Cancel</Button></div>
		{:else if kind === "heading" || kind === "copy"}
			<WordsToolbar {doc} focus={words} {editable} bind:linking />
		{:else if section?.kind === "image"}
			<div class="fields">
				<Button busy={uploading} onclick={onpicture}>
					{#snippet icon()}<Icon name="upload" size={16} />{/snippet}{section.assetId ? "Change picture" : "Choose a picture"}
				</Button>
				<Field label="Size">
					<Segmented
						bind:value={() => section.size, (size) => onchange({ size } as Partial<OneOffSection>)}
						items={IMAGE_SIZE_ITEMS}
						tone="soft"
						ariaLabel="Picture size"
					/>
				</Field>
				<Field label="What it shows" for="bar-alt" hint="For people who can't see pictures.">
					<TextField id="bar-alt" value={section.alt} oninput={(event) => onchange({ alt: event.currentTarget.value })} maxlength={300} placeholder="The bar on New Year's Eve" />
				</Field>
			</div>
		{:else if section?.kind === "button"}
			<div class="fields">
				<Field label="Words on it" for="bar-label">
					<TextField id="bar-label" value={section.label} oninput={(event) => onchange({ label: event.currentTarget.value })} maxlength={40} placeholder="See the menu" />
				</Field>
				<Field label="Where it goes" for="bar-link" hint="A web page, like gwenda.co.uk/whats-on">
					<TextField id="bar-link" value={section.link} oninput={(event) => onchange({ link: event.currentTarget.value })} maxlength={1000} placeholder="https://gwenda.co.uk/whats-on" />
				</Field>
				<Field label="Look">
					<Segmented
						bind:value={() => section.look, (look) => onchange({ look } as Partial<OneOffSection>)}
						items={BUTTON_LOOK_ITEMS}
						tone="soft"
						ariaLabel="Button look"
					/>
				</Field>
			</div>
		{:else if kind === "booking"}
			<p class="hint">The website's own Book a table button, the same in every email. It can be moved or removed.</p>
		{:else}
			<p class="hint">Click a part of the email to change it, or a + to add something there.</p>
		{/if}
	</div>
</div>

<style>
	.edit-bar {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--muted);
	}
	.part-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.title {
		margin: 0;
		font-weight: 600;
	}
	.moves {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.panel {
		min-height: 4.5rem;
		display: grid;
		align-content: start;
		gap: var(--space-2);
	}
	.fields {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
	}
	.fields :global(.field) {
		min-width: 12rem;
		flex: 1 1 12rem;
	}
	.choices {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: var(--space-2);
	}
	.choice {
		display: grid;
		gap: 0.15rem;
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
	.choice-name {
		font-weight: 600;
	}
	.choice-about,
	.hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
</style>
