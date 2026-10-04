<script lang="ts">
	import { Button, Confirm, ConfirmDialog, Field, TextField } from "../ui";
	import * as api from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { countSectionItems } from "./menu-sections.js";
	import type { MenuSection } from "./types";
	import { Icon } from "../app/shell";

	let {
		sections,
		busy = false,
		onchanged,
	}: {
		sections: MenuSection[];
		busy?: boolean;
		onchanged: () => Promise<void> | void;
	} = $props();

	function drinks(count: number): string {
		return `${count} drink${count === 1 ? "" : "s"}`;
	}

	let editingId = $state<string | null>(null);
	let draftTitle = $state("");
	let draftSubtitle = $state("");
	let addingFor = $state<string | "chapter" | null>(null);
	let newTitle = $state("");
	let newParentId = $state("");
	let saving = $state(false);
	const confirm = new Confirm();

	function startEdit(section: MenuSection) {
		editingId = section._id;
		draftTitle = section.title || "";
		draftSubtitle = section.subtitle || "";
		addingFor = null;
	}

	function startAdd(parentId: string | "chapter") {
		addingFor = parentId;
		newTitle = "";
		newParentId = parentId === "chapter" ? "" : parentId;
		editingId = null;
	}

	async function saveEdit(section: MenuSection) {
		if (saving || busy) return;
		const title = draftTitle.trim();
		if (!title) {
			toast.error("Section name is required.");
			return;
		}
		try {
			saving = true;
			await api.updateSection(section._id, {
				title,
				subtitle: section.parentId ? "" : draftSubtitle.trim(),
			});
			editingId = null;
			await onchanged();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not save section.");
		} finally {
			saving = false;
		}
	}

	async function createSection() {
		if (saving || busy) return;
		const title = newTitle.trim();
		if (!title) {
			toast.error("Section name is required.");
			return;
		}
		try {
			saving = true;
			await api.createSection({
				title,
				parentId: addingFor === "chapter" ? "" : newParentId || addingFor,
			});
			addingFor = null;
			newTitle = "";
			await onchanged();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not add section.");
		} finally {
			saving = false;
		}
	}

	async function removeSection(section: MenuSection) {
		if (saving || busy) return;
		const count = countSectionItems(section);
		if (count || (section.subsections || []).length) {
			toast.error("Move the drinks (and groups) out of this section first.");
			return;
		}
		const ok = await confirm.ask({
			title: `Delete ${section.title || "this section"}?`,
			message: "It comes off the menu. It has no drinks in it. This can't be undone.",
			action: "Delete",
		});
		if (!ok) return;
		try {
			saving = true;
			await api.deleteSection(section._id);
			if (editingId === section._id) editingId = null;
			await onchanged();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not delete section.");
		} finally {
			saving = false;
		}
	}

	function siblingsOf(section: MenuSection): MenuSection[] {
		if (!section.parentId) return sections;
		return (
			sections.find((chapter) => chapter._id === section.parentId)?.subsections ||
			[]
		);
	}

	async function move(section: MenuSection, dir: -1 | 1) {
		const siblings = siblingsOf(section);
		const index = siblings.findIndex((row) => row._id === section._id);
		const swap = siblings[index + dir];
		if (!swap || saving || busy) return;
		try {
			saving = true;
			const left = section.orderRank ?? index;
			const right = swap.orderRank ?? index + dir;
			await Promise.all([
				api.updateSection(section._id, { orderRank: right }),
				api.updateSection(swap._id, { orderRank: left }),
			]);
			await onchanged();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not reorder.");
		} finally {
			saving = false;
		}
	}
</script>

{#snippet tools(section: MenuSection, index: number, count: number)}
	<div class="tools">
		<Button
			variant="ghost"
			size="xs"
			type="button"
			aria-label="Move {section.title} up"
			title="Move up"
			disabled={index === 0 || saving}
			reason={index === 0 ? "Already first" : undefined}
			onclick={() => move(section, -1)}
		>
			{#snippet icon()}<Icon name="chevron-up" size={14} />{/snippet}
		</Button>
		<Button
			variant="ghost"
			size="xs"
			type="button"
			aria-label="Move {section.title} down"
			title="Move down"
			disabled={index === count - 1 || saving}
			reason={index === count - 1 ? "Already last" : undefined}
			onclick={() => move(section, 1)}
		>
			{#snippet icon()}<Icon name="chevron-down" size={14} />{/snippet}
		</Button>
		<Button
			variant="ghost"
			size="xs"
			type="button"
			aria-expanded={editingId === section._id}
			onclick={() => (editingId === section._id ? (editingId = null) : startEdit(section))}
		>
			{#snippet icon()}<Icon name="pen" size={14} />{/snippet}
			Edit
		</Button>
	</div>
{/snippet}

{#snippet editForm(section: MenuSection)}
	<form
		class="edit"
		novalidate
		onsubmit={(e) => {
			e.preventDefault();
			saveEdit(section);
		}}
	>
		<div class="edit-fields">
			<Field label="Name" for={`sec-title-${section._id}`} width="md" required>
				<TextField id={`sec-title-${section._id}`} size="sm" bind:value={draftTitle} />
			</Field>
			{#if !section.parentId}
				<Field
					label="Subtitle"
					for={`sec-sub-${section._id}`}
					width="lg"
					optional
					hint="A line under the chapter name on the menu."
				>
					<TextField id={`sec-sub-${section._id}`} size="sm" bind:value={draftSubtitle} />
				</Field>
			{/if}
		</div>
		<div class="edit-actions">
			<Button variant="ghost" size="sm" type="button" class="delete" onclick={() => removeSection(section)}>
				{#snippet icon()}<Icon name="trash" size={14} />{/snippet}
				Delete
			</Button>
			<span class="spacer"></span>
			<Button variant="outline" size="sm" type="button" onclick={() => (editingId = null)}>
				{#snippet icon()}<Icon name="close" size={14} />{/snippet}
				Cancel
			</Button>
			<Button variant="primary" size="sm" type="submit" disabled={saving}>
				{#snippet icon()}<Icon name="save" size={14} />{/snippet}
				Save
			</Button>
		</div>
	</form>
{/snippet}

{#snippet addForm(label: string, id: string, placeholder: string, action: string)}
	<form
		class="edit"
		novalidate
		onsubmit={(e) => {
			e.preventDefault();
			createSection();
		}}
	>
		<Field {label} for={id} width="md" required>
			<TextField {id} size="sm" bind:value={newTitle} {placeholder} />
		</Field>
		<div class="edit-actions">
			<span class="spacer"></span>
			<Button variant="outline" size="sm" type="button" onclick={() => (addingFor = null)}>
				{#snippet icon()}<Icon name="close" size={14} />{/snippet}
				Cancel
			</Button>
			<Button variant="primary" size="sm" type="submit" disabled={saving}>
				{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
				{action}
			</Button>
		</div>
	</form>
{/snippet}

<div class="sections">
	<ol class="chapters">
		{#each sections as chapter, chapterIndex (chapter._id)}
			{@const groups = chapter.subsections || []}
			<li class="chapter">
				<div class="chapter-head">
					<div class="identity">
						<h3 class="chapter-name">
							{chapter.title}
							<span class="chapter-count tnum">{drinks(countSectionItems(chapter))}</span>
						</h3>
						{#if chapter.subtitle}<p class="subtitle">{chapter.subtitle}</p>{/if}
					</div>
					{@render tools(chapter, chapterIndex, sections.length)}
				</div>
				{#if editingId === chapter._id}{@render editForm(chapter)}{/if}

				<div class="groups">
					{#if groups.length}
						<ol class="group-list">
							{#each groups as sub, subIndex (sub._id)}
								<li class="group">
									<div class="group-row">
										<span class="group-name">{sub.title}</span>
										<span class="count tnum">{drinks((sub.items || []).length)}</span>
										{@render tools(sub, subIndex, groups.length)}
									</div>
									{#if editingId === sub._id}{@render editForm(sub)}{/if}
								</li>
							{/each}
						</ol>
					{/if}

					{#if addingFor === chapter._id}
						{@render addForm("Group name", `sec-new-${chapter._id}`, "Spritz", "Add group")}
					{:else}
						<button type="button" class="add-group" onclick={() => startAdd(chapter._id)}>
							<Icon name="plus" size={14} />
							Add group
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ol>

	{#if addingFor === "chapter"}
		<div class="new-chapter">
			{@render addForm("Chapter name", "sec-new-chapter", "Our Formulas", "Add chapter")}
		</div>
	{:else}
		<div>
			<Button variant="outline" size="sm" type="button" onclick={() => startAdd("chapter")}>
				{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
				Add chapter
			</Button>
		</div>
	{/if}
</div>

<ConfirmDialog {confirm} />

<style>
	.sections {
		display: grid;
		gap: var(--space-4);
	}

	.chapters,
	.group-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Chapters as a grid of blocks across the page width; rows share a height. */
	.chapters {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
		gap: var(--space-3);
	}

	.chapter {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
	}

	.chapter-head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
	}

	.identity {
		flex: 1;
		min-width: 0;
		padding-top: var(--space-1);
	}

	.chapter-name {
		margin: 0;
		font-family: var(--font);
		font-size: var(--text-base);
		font-weight: 600;
		line-height: var(--leading-base);
	}

	.chapter-count {
		margin-left: var(--space-2);
		font-size: var(--text-sm);
		font-weight: 400;
		color: var(--fg-muted);
	}

	.subtitle {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.tools {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		flex-shrink: 0;
	}

	/* Groups hang off a thin line under the chapter, so the tree reads at a glance. */
	.groups {
		display: grid;
		gap: var(--space-1);
		padding: 0 var(--space-3) var(--space-3) var(--space-5);
	}

	.group-list {
		display: grid;
		border-left: 1px solid var(--border-strong);
	}

	.group-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 2.5rem;
		padding-left: var(--space-4);
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
	}

	.group-row:hover {
		background: var(--surface-2);
	}

	.group-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-base);
	}

	.count {
		flex-shrink: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.add-group {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 2rem;
		padding: 0 var(--space-2);
		margin-left: calc(var(--space-4) - var(--space-2));
		border: 0;
		border-radius: var(--radius-md);
		background: none;
		color: var(--fg-muted);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}

	.add-group:hover {
		background: var(--surface-3);
		color: var(--fg);
	}

	.add-group:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.edit {
		display: grid;
		gap: var(--space-3);
		margin: var(--space-1) 0 var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
	}

	.chapter > .edit {
		margin: 0 var(--space-3) var(--space-3) var(--space-5);
	}

	.group .edit {
		margin-left: var(--space-4);
	}

	.edit-fields {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
	}

	.edit-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.spacer {
		flex: 1;
	}

	.edit-actions :global(.delete) {
		color: var(--danger);
	}

	@media (max-width: 900px) {
		.chapter-head {
			align-items: flex-start;
			padding-left: var(--space-4);
		}

		.groups {
			padding-left: var(--space-4);
		}

		.group-row {
			min-height: 44px;
			padding-left: var(--space-3);
		}
	}
</style>
