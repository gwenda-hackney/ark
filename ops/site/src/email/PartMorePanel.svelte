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
		IMAGE_SIZE_ITEMS,
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
	} = $props();

	const section = $derived(index >= 0 ? (sections[index]?.section ?? null) : null);


	/** It slides in from the right, and out again; on a phone, up from the bottom. */
	function slide(node: Element) {
		const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
		return fly(node, phone ? { y: 400, duration: 240, easing: cubicOut, opacity: 1 } : { x: 420, duration: 240, easing: cubicOut, opacity: 1 });
	}

	function cellKind(cell: number, kind: string) {
		if (section?.kind !== "row" || section.cells[cell]?.kind === kind) return;
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
