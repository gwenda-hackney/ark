<script lang="ts">
	import { Button, Field, TextField } from "../ui";
	import * as api from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { countSectionItems } from "./menu-sections.js";
	import type { MenuSection } from "./types";
	import { Icon } from "../app/shell";

	let {
		sections,
		busy = false,
		onchanged,
		onclose,
	}: {
		sections: MenuSection[];
		busy?: boolean;
		onchanged: () => Promise<void> | void;
		onclose?: () => void;
	} = $props();

	const showChrome = $derived(typeof onclose === "function");

	let editingId = $state<string | null>(null);
	let draftTitle = $state("");
	let draftSubtitle = $state("");
	let addingFor = $state<string | "chapter" | null>(null);
	let newTitle = $state("");
	let newParentId = $state("");
	let saving = $state(false);

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

<div class="panel" class:bare={!showChrome}>
	{#if showChrome}
		<header class="head">
			<div>
				<p class="kicker">Menu</p>
				<h2>Sections</h2>
			</div>
			<Button variant="ghost" size="sm" type="button" aria-label="Close" onclick={onclose}>
				{#snippet icon()}
					<Icon name="close" size={16} />
				{/snippet}
			</Button>
		</header>
	{/if}

	<div class="body scrollbar-fade">
		{#if showChrome}
			<p class="lead">
				Chapters and groups drinks belong to. Same tree as the print menu.
			</p>
		{/if}

		<ul class="tree">
			{#each sections as chapter, chapterIndex (chapter._id)}
				<li class="node">
					<div class="row">
						<div class="identity">
							<p class="name">{chapter.title}</p>
							<p class="meta">
								{countSectionItems(chapter)} drink{countSectionItems(chapter) === 1
									? ""
									: "s"}
							</p>
						</div>
						<div class="tools">
							<Button
								variant="ghost"
								size="xs"
								type="button"
								aria-label="Move up"
								disabled={chapterIndex === 0 || saving}
								onclick={() => move(chapter, -1)}
							>
								{#snippet icon()}
									<Icon name="chevron-up" size={14} />
								{/snippet}
							</Button>
							<Button
								variant="ghost"
								size="xs"
								type="button"
								aria-label="Move down"
								disabled={chapterIndex === sections.length - 1 || saving}
								onclick={() => move(chapter, 1)}
							>
								{#snippet icon()}
									<Icon name="chevron-down" size={14} />
								{/snippet}
							</Button>
							<Button
								variant="ghost"
								size="xs"
								type="button"
								onclick={() => startEdit(chapter)}
							>
								Edit
							</Button>
						</div>
					</div>

					{#if editingId === chapter._id}
						<form
							class="edit"
							onsubmit={(e) => {
								e.preventDefault();
								saveEdit(chapter);
							}}
						>
							<Field label="Name" for={`sec-title-${chapter._id}`}>
								<TextField
									id={`sec-title-${chapter._id}`}
									size="sm"
									bind:value={draftTitle}
								/>
							</Field>
							<Field label="Subtitle" for={`sec-sub-${chapter._id}`}>
								<TextField
									id={`sec-sub-${chapter._id}`}
									size="sm"
									bind:value={draftSubtitle}
								/>
							</Field>
							<div class="edit-actions">
								<Button variant="primary" size="sm" type="submit" disabled={saving}>
									Save
								</Button>
								<Button
									variant="ghost"
									size="sm"
									type="button"
									onclick={() => (editingId = null)}
								>
									Cancel
								</Button>
								<Button
									variant="ghost"
									size="sm"
									type="button"
									onclick={() => removeSection(chapter)}
								>
									Delete
								</Button>
							</div>
						</form>
					{/if}

					<ul class="subs">
						{#each chapter.subsections || [] as sub, subIndex (sub._id)}
							<li>
								<div class="row nested">
									<div class="identity">
										<p class="name">{sub.title}</p>
										<p class="meta">
											{(sub.items || []).length} drink{(sub.items || []).length === 1
												? ""
												: "s"}
										</p>
									</div>
									<div class="tools">
										<Button
											variant="ghost"
											size="xs"
											type="button"
											aria-label="Move up"
											disabled={subIndex === 0 || saving}
											onclick={() => move(sub, -1)}
										>
											{#snippet icon()}
												<Icon name="chevron-up" size={14} />
											{/snippet}
										</Button>
										<Button
											variant="ghost"
											size="xs"
											type="button"
											aria-label="Move down"
											disabled={
												subIndex === (chapter.subsections || []).length - 1 ||
												saving
											}
											onclick={() => move(sub, 1)}
										>
											{#snippet icon()}
												<Icon name="chevron-down" size={14} />
											{/snippet}
										</Button>
										<Button
											variant="ghost"
											size="xs"
											type="button"
											onclick={() => startEdit(sub)}
										>
											Edit
										</Button>
									</div>
								</div>
								{#if editingId === sub._id}
									<form
										class="edit"
										onsubmit={(e) => {
											e.preventDefault();
											saveEdit(sub);
										}}
									>
										<Field label="Name" for={`sec-title-${sub._id}`}>
											<TextField
												id={`sec-title-${sub._id}`}
												size="sm"
												bind:value={draftTitle}
											/>
										</Field>
										<div class="edit-actions">
											<Button
												variant="primary"
												size="sm"
												type="submit"
												disabled={saving}
											>
												Save
											</Button>
											<Button
												variant="ghost"
												size="sm"
												type="button"
												onclick={() => (editingId = null)}
											>
												Cancel
											</Button>
											<Button
												variant="ghost"
												size="sm"
												type="button"
												onclick={() => removeSection(sub)}
											>
												Delete
											</Button>
										</div>
									</form>
								{/if}
							</li>
						{/each}
					</ul>

					{#if addingFor === chapter._id}
						<form
							class="edit"
							onsubmit={(e) => {
								e.preventDefault();
								createSection();
							}}
						>
							<Field label="Group name" for={`sec-new-${chapter._id}`}>
								<TextField
									id={`sec-new-${chapter._id}`}
									size="sm"
									bind:value={newTitle}
									placeholder="Spritz"
								/>
							</Field>
							<div class="edit-actions">
								<Button variant="primary" size="sm" type="submit" disabled={saving}>
									Add group
								</Button>
								<Button
									variant="ghost"
									size="sm"
									type="button"
									onclick={() => (addingFor = null)}
								>
									Cancel
								</Button>
							</div>
						</form>
					{:else}
						<div class="add-row">
							<Button
								variant="ghost"
								size="xs"
								type="button"
								onclick={() => startAdd(chapter._id)}
							>
								{#snippet icon()}
									<Icon name="plus" size={14} />
								{/snippet}
								Add group
							</Button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if addingFor === "chapter"}
			<form
				class="edit"
				onsubmit={(e) => {
					e.preventDefault();
					createSection();
				}}
			>
				<Field label="Chapter name" for="sec-new-chapter">
					<TextField
						id="sec-new-chapter"
						size="sm"
						bind:value={newTitle}
						placeholder="Our Formulas"
					/>
				</Field>
				<div class="edit-actions">
					<Button variant="primary" size="sm" type="submit" disabled={saving}>
						Add chapter
					</Button>
					<Button
						variant="ghost"
						size="sm"
						type="button"
						onclick={() => (addingFor = null)}
					>
						Cancel
					</Button>
				</div>
			</form>
		{:else}
			<Button variant="outline" size="sm" type="button" onclick={() => startAdd("chapter")}>
				{#snippet icon()}
					<Icon name="plus" size={15} />
				{/snippet}
				Add chapter
			</Button>
		{/if}
	</div>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--card);
	}

	.panel.bare {
		height: auto;
		background: transparent;
	}

	.panel.bare .body {
		padding: 0;
		overflow: visible;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: 1rem var(--card-pad) 0.65rem;
		border-bottom: 1px solid var(--border);
	}

	.kicker {
		margin: 0 0 0.15rem;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
		letter-spacing: var(--tracking-lg);
		font-weight: 600;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 0.9rem var(--card-pad) var(--card-pad);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.lead {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
		line-height: 1.45;
	}

	.tree,
	.subs {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.node {
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--border);
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.row.nested {
		padding-left: var(--space-3);
	}

	.identity {
		min-width: 0;
	}

	.name {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 500;
	}

	.meta {
		margin: 0.1rem 0 0;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.tools {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		flex-shrink: 0;
	}

	.edit {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--sunken);
	}

	.edit-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.add-row {
		padding-left: var(--space-3);
		margin-top: 0.2rem;
	}
</style>
