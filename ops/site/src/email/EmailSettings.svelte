<script lang="ts">
	/**
	 * The one-off editor's right half (#348), beside the email: what the
	 * inbox shows (subject, preview line) and the width it's seen at (its
	 * name is typed over in the editor's heading); then the picked part's settings (a picture's size and
	 * description, a Row's cells, a button's words and address, an Event).
	 */
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
		editable,
		subject = $bindable(""),
		previewText = $bindable(""),
		width = $bindable("desktop"),
		sections,
		index,
		uploading,
		onchange,
		onpicture,
		onevent,
		oncell,
	}: {
		editable: boolean;
		subject?: string;
		previewText?: string;
		/** The width the email is seen at: desktop or phone. */
		width?: string;
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

	const WIDTHS = [
		{ id: "desktop", label: "Desktop" },
		{ id: "phone", label: "Phone" },
	];

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

<div class="settings">
	<section class="inbox" aria-label="What the inbox shows">
		<Field label="Subject" for="email-subject" required>
			<TextField id="email-subject" bind:value={subject} maxlength={150} disabled={!editable} placeholder="New Year's Eve at Gwenda" autocomplete="off" />
		</Field>
		<Field label="Preview line" for="email-preview" optional hint="Shown after the subject in most inboxes.">
			<TextField id="email-preview" bind:value={previewText} maxlength={200} disabled={!editable} placeholder="Doors at 9, music till late" autocomplete="off" />
		</Field>
		<Field label="See it on">
			<Segmented bind:value={width} items={WIDTHS} tone="soft" ariaLabel="Email width" />
		</Field>
	</section>

	<section class="picked" aria-label="The picked part">
		<h2>{section ? `${partName(section.kind)} · ${index + 1} of ${sections.length}` : "Nothing picked"}</h2>
		{#if !editable}
			<p class="hint">Sent or scheduled: it can't be changed.</p>
		{:else if section}
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
		{:else}
			<p class="hint">Click a part of the email to change it. Drag a part by its gold handle to move it; a + adds something there.</p>
		{/if}
	</section>
</div>

<style>
	.settings {
		display: grid;
		align-content: start;
		gap: var(--space-5, 1.5rem);
		height: 100%;
		overflow: auto;
		padding: var(--space-1) var(--space-1) var(--space-4);
	}
	.inbox,
	.picked,
	.part,
	.cell {
		display: grid;
		gap: var(--space-3);
	}
	.picked {
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 600;
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
</style>
