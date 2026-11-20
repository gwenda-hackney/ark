<script lang="ts">
	/**
	 * Beside the email in the one-off editor (#348): every part of the email
	 * in order (click one to go to it in the email and pick it), then what the
	 * picked part needs: Bold and Link for words (WordsToolbar), a picture's
	 * Change picture, size and description, a Row's cells, a button's words,
	 * address and look, an Event's Choose an event; and Remove. After a + in
	 * the email it offers what can go there. Parts move by dragging them in
	 * the email. On a phone it's a sheet at the bottom of the screen.
	 */
	import { Button, Field, Segmented, TextField } from "../ui";
	import { Icon } from "../app/shell";
	import type { OneOffSection, RowCell } from "./email-api";
	import {
		BUTTON_LOOK_ITEMS,
		CELL_ITEMS,
		IMAGE_SIZE_ITEMS,
		SECTION_CHOICES,
		partName,
		partSummary,
		type EditorSection,
		type SectionKind,
	} from "./one-off-view";
	import type { WordsFocus } from "./preview-editing";
	import WordsToolbar from "./WordsToolbar.svelte";

	let {
		doc,
		words,
		editable,
		linking = $bindable(false),
		sections,
		index,
		inserting,
		uploading,
		onpick,
		oninsert,
		onremove,
		onchange,
		onchoose,
		oncancel,
		onpicture,
		onevent,
		oncell,
		onclose,
	}: {
		doc: Document | null;
		words: WordsFocus | null;
		editable: boolean;
		linking?: boolean;
		sections: EditorSection[];
		/** The picked part's place, or -1. */
		index: number;
		/** A + was pressed: the place a new part would go, or null. */
		inserting: number | null;
		uploading: boolean;
		onpick: (index: number) => void;
		oninsert: (at: number) => void;
		onremove: () => void;
		/** Fields of the picked part changed. */
		onchange: (patch: Partial<OneOffSection>) => void;
		onchoose: (kind: SectionKind) => void;
		oncancel: () => void;
		/** Choose or change a picture: the picked Picture's, or a Row's cell `cell`. */
		onpicture: (cell?: number) => void;
		onevent: () => void;
		/** A Row's cell `cell` is now `value`. */
		oncell: (cell: number, value: RowCell) => void;
		/** Nothing picked any more (the sheet's close, on a phone). */
		onclose: () => void;
	} = $props();

	const section = $derived(index >= 0 ? (sections[index]?.section ?? null) : null);
	const open = $derived(Boolean(section) || inserting !== null);
	const keep = (event: MouseEvent) => event.preventDefault();

	function cellKind(cell: number, kind: string) {
		if (section?.kind !== "row") return;
		const now = section.cells[cell];
		if (now?.kind === kind) return;
		oncell(cell, kind === "picture" ? { kind: "picture", assetId: "", alt: "" } : ({ kind } as RowCell));
		if (kind === "picture") onpicture(cell);
	}

	function cellCount(count: number) {
		if (section?.kind !== "row" || count === section.cells.length) return;
		const cells = section.cells.slice(0, count);
		while (cells.length < count) cells.push({ kind: "empty" });
		onchange({ cells } as Partial<OneOffSection>);
	}
</script>

<aside class="side" class:open aria-label="The email's parts">
	<section class="outline" aria-label="In this email">
		<h3>In this email</h3>
		<ol>
			<li class="fixed">Logo · Hackney Wick</li>
			{#each sections as entry, at (entry.key)}
				<li>
					<button type="button" class="item" class:picked={at === index} aria-current={at === index ? "true" : undefined} onmousedown={keep} onclick={() => onpick(at)}>
						<span class="item-name">{partName(entry.section.kind)}</span>
						<span class="item-about">{partSummary(entry.section)}</span>
					</button>
				</li>
			{/each}
			<li class="fixed">Foot · links, unsubscribe, address</li>
		</ol>
		{#if editable}
			<Button variant="outline" size="sm" onclick={() => oninsert(sections.length)}>
				{#snippet icon()}<Icon name="plus" size={14} />{/snippet}Add at the end
			</Button>
		{/if}
	</section>

	<section class="details" aria-label="The picked part">
		<div class="details-head">
			<h3>
				{inserting !== null ? "Add something" : section ? `${partName(section.kind)} · ${index + 1} of ${sections.length}` : "Nothing picked"}
			</h3>
			<div class="head-actions">
				{#if section && editable}
					<Button variant="outline" size="sm" onmousedown={keep} onclick={onremove}>
						{#snippet icon()}<Icon name="trash" size={14} />{/snippet}Remove
					</Button>
				{/if}
				<button type="button" class="sheet-close" aria-label="Close" onclick={onclose}><Icon name="close" size={16} /></button>
			</div>
		</div>

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
		{:else if section?.kind === "heading" || section?.kind === "copy"}
			<WordsToolbar {doc} focus={words} {editable} bind:linking />
		{:else if section?.kind === "image"}
			<div class="fields">
				<Button busy={uploading} onclick={() => onpicture()}>
					{#snippet icon()}<Icon name="upload" size={16} />{/snippet}{section.assetId ? "Change picture" : "Choose a picture"}
				</Button>
				<Field label="Size">
					<Segmented bind:value={() => section.size, (size) => onchange({ size } as Partial<OneOffSection>)} items={IMAGE_SIZE_ITEMS} tone="soft" ariaLabel="Picture size" />
				</Field>
				<Field label="What it shows" for="side-alt" hint="For people who can't see pictures.">
					<TextField id="side-alt" value={section.alt} oninput={(event) => onchange({ alt: event.currentTarget.value })} maxlength={300} placeholder="The bar on New Year's Eve" />
				</Field>
			</div>
		{:else if section?.kind === "row"}
			<div class="fields">
				<Field label="Cells">
					<Segmented
						bind:value={() => String(section.cells.length), (count) => cellCount(Number(count))}
						items={[
							{ id: "2", label: "Two" },
							{ id: "3", label: "Three" },
						]}
						tone="soft"
						ariaLabel="How many cells"
					/>
				</Field>
				<p class="hint">Drag a cell onto another in the email to swap them.</p>
				{#each section.cells as cell, at (at)}
					<div class="cell">
						<Field label={`Cell ${at + 1}`}>
							<Segmented bind:value={() => cell.kind, (kind) => cellKind(at, kind)} items={CELL_ITEMS} tone="soft" ariaLabel={`Cell ${at + 1} holds`} />
						</Field>
						{#if cell.kind === "picture"}
							<Button size="sm" variant="outline" busy={uploading} onclick={() => onpicture(at)}>
								{#snippet icon()}<Icon name="upload" size={14} />{/snippet}{cell.assetId ? "Change picture" : "Choose a picture"}
							</Button>
							<Field label="What it shows" for={`side-cell-${at}`}>
								<TextField id={`side-cell-${at}`} value={cell.alt} oninput={(event) => oncell(at, { ...cell, alt: event.currentTarget.value })} maxlength={300} />
							</Field>
						{/if}
					</div>
				{/each}
			</div>
		{:else if section?.kind === "button"}
			<div class="fields">
				<Field label="Words on it" for="side-label">
					<TextField id="side-label" value={section.label} oninput={(event) => onchange({ label: event.currentTarget.value })} maxlength={40} placeholder="See the menu" />
				</Field>
				<Field label="Where it goes" for="side-link" hint="A web page, like gwenda.co.uk/whats-on">
					<TextField id="side-link" value={section.link} oninput={(event) => onchange({ link: event.currentTarget.value })} maxlength={1000} placeholder="https://gwenda.co.uk/whats-on" />
				</Field>
				<Field label="Look">
					<Segmented bind:value={() => section.look, (look) => onchange({ look } as Partial<OneOffSection>)} items={BUTTON_LOOK_ITEMS} tone="soft" ariaLabel="Button look" />
				</Field>
			</div>
		{:else if section?.kind === "event"}
			<div class="fields">
				<Button onclick={onevent}>
					{#snippet icon()}<Icon name="calendar" size={16} />{/snippet}{section.title ? "Choose another event" : "Choose an event"}
				</Button>
				<p class="hint">{section.title ? `${section.title}: its words come from What's on as they were when it was chosen.` : "A night, deal or pop-up kitchen from What's on."}</p>
			</div>
		{:else if section?.kind === "booking"}
			<p class="hint">The website's own Book a table button, the same in every email.</p>
		{:else if section?.kind === "divider"}
			<p class="hint">A dashed line, like the one between the monthly email's parts.</p>
		{:else}
			<p class="hint">Click a part of the email, or one in the list, to change it. Drag a part by its gold handle to move it. A + adds something there.</p>
		{/if}
	</section>
</aside>

<style>
	.side {
		display: grid;
		align-content: start;
		gap: var(--space-4);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--muted);
		max-height: calc(100dvh - 12rem);
		overflow: auto;
	}
	h3 {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}
	/* The list scrolls on its own, so the picked part's settings below it stay in sight. */
	.outline {
		display: grid;
		gap: var(--space-2);
		max-height: 38dvh;
		overflow: auto;
		padding-right: 0.25rem;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.25rem;
	}
	.fixed {
		padding: 0.35rem var(--space-2);
		border: 1px dashed var(--border);
		border-radius: var(--radius-sm, 6px);
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		text-align: center;
	}
	.item {
		display: grid;
		width: 100%;
		gap: 0.05rem;
		padding: 0.4rem var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-sm, 6px);
		background: var(--card);
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.item:hover {
		border-color: var(--border);
	}
	.item.picked {
		border-color: var(--primary);
		box-shadow: inset 3px 0 0 var(--primary);
	}
	.item-name {
		font-size: var(--text-xs);
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.item-about {
		font-size: var(--text-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.details {
		display: grid;
		gap: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.details-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: 2rem;
	}
	.head-actions {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}
	.sheet-close {
		display: none;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		padding: 0.25rem;
	}
	.fields,
	.cell {
		display: grid;
		gap: var(--space-3);
	}
	.cell {
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.choices {
		display: grid;
		gap: var(--space-2);
	}
	.choice {
		display: grid;
		gap: 0.1rem;
		padding: var(--space-2) var(--space-3);
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
	/* A phone: the list stays out of the way; what's picked rises as a sheet from the bottom. */
	@media (max-width: 900px) {
		.side {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 30;
			max-height: 60dvh;
			border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
			box-shadow: 0 -10px 30px rgb(0 0 0 / 0.45);
			transform: translateY(110%);
			transition: transform 200ms ease;
		}
		.side.open {
			transform: none;
		}
		.outline {
			display: none;
		}
		.details {
			border-top: 0;
			padding-top: 0;
		}
		.sheet-close {
			display: inline-flex;
		}
	}
</style>
