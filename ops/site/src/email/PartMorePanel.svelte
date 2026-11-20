<script lang="ts">
	/**
	 * More, in the one-off editor (#348): from ⋯ More on a part's toolbar in
	 * the email, a side panel slides in over the right of the page with that
	 * part's settings (a picture's size and description, a Row's cells, a
	 * button's words, address and look), and slides away when closed.
	 * Changes show in the email as they're made. On a phone it rises from
	 * the bottom.
	 */
	import { fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { Button, Field, Segmented, TextField } from "../ui";
	import { Icon } from "../app/shell";
	import type { OneOffSection, RowCell } from "./email-api";
	import {
		BUTTON_LOOK_ITEMS,
		CELL_ITEMS,
		CELL_WIDTH_ITEMS,
		IMAGE_SIZE_ITEMS,
		WORDS_LOOK_ITEMS,
		partName,
		type EditorSection,
	} from "./one-off-view";

	let {
		open,
		onclose,
		sections,
		index,
		uploading,
		onchange,
		onpicture,
		onevent,
		oncell,
		cell = -1,
		onpickcell,
		onhold,
	}: {
		open: boolean;
		onclose: () => void;
		sections: EditorSection[];
		/** The picked part's place, or -1. */
		index: number;
		uploading: boolean;
		/** Fields of the picked part changed. */
		onchange: (patch: Partial<OneOffSection>) => void;
		/** Choose or change a picture: the picked Picture's, or a Row's cell `cell`. */
		onpicture: (cell?: number) => void;
		onevent: () => void;
		/** A Row's cell `cell` is now `value`. */
		oncell: (cell: number, value: RowCell) => void;
		/** In a Row, the column picked in the email (-1: none yet, the first is shown). */
		cell?: number;
		/** Another column picked here. */
		onpickcell: (cell: number) => void;
		/** Column `cell` is to hold `kind` (a picture opens the chooser, words get the typing in the email). */
		onhold: (cell: number, kind: RowCell["kind"]) => void;
	} = $props();

	const section = $derived(index >= 0 ? (sections[index]?.section ?? null) : null);
	/** The Row's column shown: the one picked, else the first. */
	const column = $derived(section?.kind === "row" ? Math.min(Math.max(cell, 0), section.cells.length - 1) : 0);


	/** It slides in from the right, and out again; on a phone, up from the bottom. */
	function slide(node: Element) {
		const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
		return fly(node, phone ? { y: 400, duration: 240, easing: cubicOut, opacity: 1 } : { x: 420, duration: 240, easing: cubicOut, opacity: 1 });
	}

	function cellCount(count: number) {
		if (section?.kind !== "row" || count === section.cells.length) return;
		const cells = section.cells.slice(0, count);
		while (cells.length < count) cells.push({ kind: "empty", width: "fill" });
		onchange({ cells } as Partial<OneOffSection>);
	}
</script>

{#if open && section}
	<aside class="side" aria-label={`${partName(section.kind)}: more`} transition:slide>
		<div class="head">
			<h2>{partName(section.kind)} · {index + 1} of {sections.length}</h2>
			<button type="button" class="close" aria-label="Close" onclick={onclose}><Icon name="close" size={18} /></button>
		</div>
			<div class="part">
				{#if section.kind === "image"}
					<Button busy={uploading} onclick={() => onpicture()}>
						{#snippet icon()}<Icon name="upload" size={16} />{/snippet}{section.assetId ? "Change picture" : "Choose a picture"}
					</Button>
					<Field label="Size">
						<Segmented bind:value={() => section.size, (size) => onchange({ size } as Partial<OneOffSection>)} items={IMAGE_SIZE_ITEMS} tone="soft" ariaLabel="Picture size" />
					</Field>
					<Field label="What it shows" for="side-alt" hint="For people who can't see pictures.">
						<TextField id="side-alt" value={section.alt} oninput={(event) => onchange({ alt: event.currentTarget.value })} maxlength={300} placeholder="The bar on New Year's Eve" />
					</Field>
				{:else if section.kind === "row"}
					<Field label="Columns">
						<Segmented
							bind:value={() => String(section.cells.length), (count) => cellCount(Number(count))}
							items={[
								{ id: "2", label: "Two" },
								{ id: "3", label: "Three" },
							]}
							tone="soft"
							ariaLabel="How many columns"
						/>
					</Field>
					<Field label="Pictures" hint="Cut to one shape, side by side photos line up.">
						<Segmented
							bind:value={() => (section.crop ? "same" : "whole"), (shape) => onchange({ crop: shape === "same" } as Partial<OneOffSection>)}
							items={[
								{ id: "whole", label: "As they are" },
								{ id: "same", label: "Same shape" },
							]}
							tone="soft"
							ariaLabel="Pictures' shape"
						/>
					</Field>
					<Field label="Column">
						<Segmented
							bind:value={() => String(column), (at) => onpickcell(Number(at))}
							items={section.cells.map((_, at) => ({ id: String(at), label: `Column ${at + 1}` }))}
							tone="soft"
							ariaLabel="Which column"
						/>
					</Field>
					{#each [section.cells[column]] as picked (column)}
						<div class="cell">
							<Field label="Holds">
								<Segmented bind:value={() => picked.kind, (kind) => onhold(column, kind as RowCell["kind"])} items={CELL_ITEMS} tone="soft" ariaLabel={`Column ${column + 1} holds`} />
							</Field>
							<Field label="Width" hint="Small, Medium and Large are set sizes; Fill shares what's left.">
								<Segmented bind:value={() => picked.width, (width) => oncell(column, { ...picked, width } as RowCell)} items={CELL_WIDTH_ITEMS} tone="soft" ariaLabel={`Column ${column + 1} width`} />
							</Field>
							{#if picked.kind === "picture"}
								<Button size="sm" variant="outline" busy={uploading} onclick={() => onpicture(column)}>
									{#snippet icon()}<Icon name="upload" size={14} />{/snippet}{picked.assetId ? "Change picture" : "Choose a picture"}
								</Button>
								<Field label="What it shows" for="side-cell-alt">
									<TextField id="side-cell-alt" value={picked.alt} oninput={(event) => oncell(column, { ...picked, alt: event.currentTarget.value })} maxlength={300} />
								</Field>
							{:else if picked.kind === "words"}
								<Field label="Words" for="side-cell-words" hint="Or type them in the email.">
									<TextField id="side-cell-words" value={picked.text} oninput={(event) => oncell(column, { ...picked, text: event.currentTarget.value })} maxlength={200} placeholder="×" />
								</Field>
								<Field label="Look">
									<Segmented bind:value={() => picked.look, (look) => oncell(column, { ...picked, look } as RowCell)} items={WORDS_LOOK_ITEMS} tone="soft" ariaLabel={`Column ${column + 1} words look`} />
								</Field>
							{/if}
						</div>
					{/each}
					<p class="hint">Click a column in the email to change it here. Drag a column's picture onto another column to swap them.</p>
				{:else if section.kind === "button"}
					<Field label="Words on it" for="side-label">
						<TextField id="side-label" value={section.label} oninput={(event) => onchange({ label: event.currentTarget.value })} maxlength={40} placeholder="See the menu" />
					</Field>
					<Field label="Where it goes" for="side-link" hint="A web page, like gwenda.co.uk/whats-on">
						<TextField id="side-link" value={section.link} oninput={(event) => onchange({ link: event.currentTarget.value })} maxlength={1000} placeholder="https://gwenda.co.uk/whats-on" />
					</Field>
					<Field label="Look">
						<Segmented bind:value={() => section.look, (look) => onchange({ look } as Partial<OneOffSection>)} items={BUTTON_LOOK_ITEMS} tone="soft" ariaLabel="Button look" />
					</Field>
				{:else if section.kind === "event"}
					<Button onclick={onevent}>
						{#snippet icon()}<Icon name="calendar" size={16} />{/snippet}{section.title ? "Choose another event" : "Choose an event"}
					</Button>
					<p class="hint">{section.title ? `${section.title}: its words come from What's on as they were when it was chosen.` : "A night, deal or pop-up kitchen from What's on."}</p>
				{:else if section.kind === "heading" || section.kind === "copy"}
					<p class="hint">Type in the email. Select words, then Bold or Link on the part's toolbar.</p>
				{:else if section.kind === "booking"}
					<p class="hint">The website's own Book a table button, the same in every email.</p>
				{:else}
					<p class="hint">A dashed line, like the one between the monthly email's parts.</p>
				{/if}
			</div>
	</aside>
{/if}

<style>
	.side {
		position: fixed;
		top: 5.5rem;
		right: var(--space-4);
		bottom: 5.5rem;
		z-index: 40;
		width: min(24rem, calc(100vw - 2rem));
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg, 12px);
		background: var(--card);
		box-shadow: -12px 0 40px rgb(0 0 0 / 0.45);
		overflow: auto;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	h2 {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 600;
	}
	.close {
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		padding: 0.25rem;
	}
	.part,
	.cell {
		display: grid;
		gap: var(--space-3);
	}
	.cell {
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
	@media (max-width: 900px) {
		.side {
			top: auto;
			left: 0;
			right: 0;
			bottom: var(--bottom-nav-h, 0px);
			width: auto;
			max-height: min(70dvh, calc(100dvh - var(--bottom-nav-h, 0px) - 4rem));
			border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
			box-shadow: 0 -10px 30px rgb(0 0 0 / 0.45);
		}
	}
</style>
