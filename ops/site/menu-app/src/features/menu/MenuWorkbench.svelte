<script lang="ts">
	import { onMount } from "svelte";
	import { Button, NativeSelect } from "../../ui";
	import type { SelectOption } from "../../ui/types";
	import * as api from "../../lib/api";
	import type { MenuItem, MenuSection, PublishTarget } from "../../lib/types";
	import RecipeList from "./RecipeList.svelte";
	import RecipeEditor from "./RecipeEditor.svelte";
	import SpecBook from "./SpecBook.svelte";

	let sections = $state<MenuSection[]>([]);
	let selectedId = $state<string | null>(null);
	let item = $state<MenuItem | null>(null);
	let query = $state("");
	let publishTarget = $state<PublishTarget>(
		(localStorage.getItem("gwenda-ops-menu-publish") as PublishTarget) ||
			"staging",
	);
	let bookMode = $state(false);
	let loadError = $state("");
	let saveStatus = $state("");
	let saveKind = $state<"" | "ok" | "error">("");
	let photoStatus = $state("");
	let photoKind = $state<"" | "ok" | "error">("");
	let importStatus = $state("");
	let importKind = $state<"" | "ok" | "error">("");
	let importText = $state("");
	let busy = $state(false);
	let needsAuth = $state(false);
	let authPassword = $state("");
	let authError = $state("");

	const publishOptions: SelectOption[] = [
		{ value: "staging", label: "Staging site" },
		{ value: "production", label: "Live preview" },
	];

	const publishLabel = $derived(
		publishTarget === "production"
			? "Sync + publish live preview"
			: "Sync + publish to staging",
	);

	function allItems(): MenuItem[] {
		return sections.flatMap((section) =>
			(section.items || []).map((row) => ({ ...row, section })),
		);
	}

	function findItem(id: string | null) {
		if (!id) return null;
		return allItems().find((row) => row._id === id) || null;
	}

	async function loadMenu() {
		const data = await api.getMenu();
		sections = data.sections || [];
		needsAuth = false;
		if (selectedId) {
			item = findItem(selectedId);
		}
	}

	async function submitAuth() {
		authError = "";
		try {
			await api.login(authPassword, "/menu/");
			authPassword = "";
			await loadMenu();
		} catch (err) {
			authError = err instanceof Error ? err.message : "Login failed.";
		}
	}

	function selectItem(next: MenuItem | null) {
		selectedId = next?._id || null;
		item = next
			? {
					...next,
					sectionId:
						next.sectionId || next.section?._ref || next.section?._id || "",
				}
			: null;
		saveStatus = "";
		saveKind = "";
		photoStatus = "";
		photoKind = "";
	}

	function newItem() {
		const first = sections[0];
		selectItem({
			name: "",
			sectionId: first?._id,
			ingredients: [{}],
			onDigitalMenu: true,
		});
	}

	async function save() {
		if (!item) return;
		try {
			busy = true;
			saveStatus = "Saving…";
			saveKind = "";
			const payload = {
				name: item.name,
				sectionId: item.sectionId,
				price: item.price,
				notes: item.notes,
				glassware: item.glassware,
				ice: item.ice,
				garnish: item.garnish,
				signature: item.signature === true,
				onDigitalMenu: item.onDigitalMenu !== false,
				description: item.description,
				lockDescription: item.lockDescription === true,
				method: item.method,
				abv: item.abv,
				volume: item.volume,
				producer: item.producer,
				ingredients: item.ingredients || [],
			};
			const existing = item._id;
			const data = existing
				? await api.updateItem(existing, payload)
				: await api.createItem(payload);
			selectedId = data.item?._id || existing || null;
			await loadMenu();
			item = findItem(selectedId);
			saveStatus = "Saved. Publish when you want this on the digital menu.";
			saveKind = "ok";
		} catch (err) {
			saveStatus = err instanceof Error ? err.message : "Save failed.";
			saveKind = "error";
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!item?._id) {
			selectItem(null);
			return;
		}
		if (!confirm(`Remove ${item.name} from the menu?`)) return;
		try {
			await api.deleteItem(item._id);
			selectedId = null;
			await loadMenu();
			selectItem(null);
		} catch (err) {
			saveStatus = err instanceof Error ? err.message : "Delete failed.";
			saveKind = "error";
		}
	}

	async function onPhoto(file: File) {
		if (!item?._id) {
			photoStatus = "Save the drink first, then add a photo.";
			photoKind = "error";
			return;
		}
		const form = new FormData();
		form.set("itemId", item._id);
		form.set("alt", item.name || "");
		form.set("file", file);
		try {
			photoStatus = "Uploading…";
			photoKind = "";
			await api.uploadPhoto(form);
			await loadMenu();
			item = findItem(selectedId);
			photoStatus = "Photo saved.";
			photoKind = "ok";
		} catch (err) {
			photoStatus = err instanceof Error ? err.message : "Upload failed.";
			photoKind = "error";
		}
	}

	async function publish() {
		if (
			publishTarget === "production" &&
			!confirm(
				"Sync Baserow recipes into the production Sanity menu, then rebuild the live preview?",
			)
		) {
			return;
		}
		try {
			saveStatus = "Syncing to digital menu…";
			saveKind = "";
			const data = await api.publishMenu(publishTarget);
			const syncNote = data.sync
				? ` Synced ${data.sync.synced?.length || 0} item(s)${
						data.sync.missing?.length
							? `; missing in Sanity: ${data.sync.missing.join(", ")}`
							: ""
					}.`
				: "";
			const extra = data.runUrl ? ` Follow the job: ${data.runUrl}` : "";
			saveStatus = `Publish started (${data.target || publishTarget}).${syncNote}${extra}`;
			saveKind = data.sync?.missing?.length ? "error" : "ok";
		} catch (err) {
			saveStatus = err instanceof Error ? err.message : "Publish failed.";
			saveKind = "error";
		}
	}

	async function runImport() {
		try {
			importStatus = "Importing…";
			importKind = "";
			const data = await api.importRecipes(importText);
			await loadMenu();
			const missed = data.unmatched?.length
				? ` Unmatched: ${data.unmatched.join(", ")}.`
				: "";
			importStatus = `Updated ${data.matched?.length || 0} drink(s).${missed}`;
			importKind = data.unmatched?.length ? "error" : "ok";
		} catch (err) {
			importStatus = err instanceof Error ? err.message : "Import failed.";
			importKind = "error";
		}
	}

	async function onImportFile(file: File) {
		try {
			if (
				file.type === "application/pdf" ||
				file.name.toLowerCase().endsWith(".pdf")
			) {
				importStatus =
					"PDF upload is supported on the static editor; paste CSV for now.";
				importKind = "error";
				return;
			}
			importText = await file.text();
			importStatus = "File loaded. Import to write recipes.";
			importKind = "ok";
		} catch (err) {
			importStatus = err instanceof Error ? err.message : "Could not read file.";
			importKind = "error";
		}
	}

	onMount(() => {
		loadMenu().catch((err) => {
			const message = err instanceof Error ? err.message : "Failed to load menu.";
			if (message.startsWith("auth:")) {
				needsAuth = true;
				loadError = "";
				return;
			}
			loadError = message;
		});
	});
</script>

{#if needsAuth}
	<div class="auth">
		<p class="eyebrow">Gwenda · internal</p>
		<h1>Enter</h1>
		<p class="muted">Password required for menu recipes.</p>
		<form
			class="auth-form"
			onsubmit={(e) => {
				e.preventDefault();
				submitAuth();
			}}
		>
			<input
				type="password"
				bind:value={authPassword}
				placeholder="Password"
				autocomplete="current-password"
				required
			/>
			<Button variant="primary" type="submit">Enter</Button>
			{#if authError}
				<p class="auth-error">{authError}</p>
			{/if}
		</form>
	</div>
{:else if bookMode}
	<SpecBook items={allItems()} onclose={() => (bookMode = false)} />
{:else}
	<div class="workbench">
		<header class="top">
			<div class="brand">
				<p class="eyebrow">Gwenda · internal</p>
				<h1>Menu recipes</h1>
				<a class="back" href="/">Back to ops</a>
			</div>
			<div class="tools">
				<label class="target">
					<span>Publish target</span>
					<NativeSelect
						size="sm"
						options={publishOptions}
						value={publishTarget}
						onchange={(e) => {
							publishTarget = (e.currentTarget as HTMLSelectElement)
								.value as PublishTarget;
							localStorage.setItem("gwenda-ops-menu-publish", publishTarget);
						}}
					/>
				</label>
				<Button
					variant="outline"
					size="sm"
					onclick={() =>
						loadMenu().catch((err) => {
							saveStatus = err instanceof Error ? err.message : "Reload failed.";
							saveKind = "error";
						})}>Reload</Button
				>
				<Button variant="outline" size="sm" onclick={newItem}>New item</Button>
				<Button variant="outline" size="sm" onclick={() => (bookMode = true)}
					>Print book</Button
				>
				<Button variant="primary" size="sm" {busy} onclick={publish}
					>{publishLabel}</Button
				>
			</div>
		</header>

		{#if publishTarget === "production"}
			<p class="warn">
				Publish to live preview syncs guest-facing fields into the production
				Sanity menu, then rebuilds the site preview. Recipes stay in Baserow Ops.
			</p>
		{/if}

		{#if loadError}
			<p class="load-error">{loadError}</p>
		{:else}
			<div class="body">
				<RecipeList
					{sections}
					{selectedId}
					bind:query
					onselect={selectItem}
				/>
				<main class="main">
					<RecipeEditor
						bind:item
						{sections}
						{saveStatus}
						{saveKind}
						{photoStatus}
						{photoKind}
						{importStatus}
						{importKind}
						bind:importText
						onsave={save}
						ondelete={remove}
						onphoto={onPhoto}
						onimport={runImport}
						onimportfile={onImportFile}
					/>
				</main>
			</div>
		{/if}
	</div>
{/if}

<style>
	.auth {
		min-height: 100dvh;
		display: grid;
		place-content: center;
		gap: var(--gap-sm);
		padding: var(--page-gutter);
		text-align: center;
	}

	.auth h1 {
		font-size: 1.5rem;
	}

	.auth .muted {
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}

	.auth-form {
		display: grid;
		gap: var(--gap-xs);
		width: min(100%, 18rem);
		margin: var(--gap) auto 0;
	}

	.auth-form input {
		height: var(--control-h);
		padding: 0 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--sunken);
		color: var(--foreground);
	}

	.auth-error {
		color: var(--destructive);
		font-size: 0.8125rem;
	}

	.workbench {
		display: grid;
		grid-template-rows: auto auto 1fr;
		height: 100dvh;
		overflow: hidden;
		background: var(--background);
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm) var(--gap);
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem var(--page-gutter);
		background: var(--card);
		border-bottom: 1px solid var(--border);
		min-height: calc(var(--topbar-h, 4rem));
	}

	.brand {
		display: grid;
		gap: 0.1rem;
	}

	.brand h1 {
		font-size: 1.25rem;
		line-height: 1.15;
	}

	.back {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.back:hover {
		color: var(--foreground);
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
		justify-content: flex-end;
	}

	.target {
		display: grid;
		grid-auto-flow: column;
		gap: 0.45rem;
		align-items: center;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--muted-foreground);
		height: var(--control-h-sm);
	}

	.target :global(select) {
		width: auto;
		min-width: 9.5rem;
	}

	.warn {
		margin: 0;
		padding: 0.55rem var(--page-gutter);
		border-bottom: 1px solid var(--border-strong);
		background: var(--primary-wash);
		color: color-mix(in srgb, var(--primary) 70%, var(--foreground));
		font-size: 0.8125rem;
	}

	.load-error {
		padding: 2rem var(--page-gutter);
		color: var(--destructive);
	}

	.body {
		display: grid;
		grid-template-columns: minmax(16rem, 20rem) 1fr;
		min-height: 0;
		overflow: hidden;
	}

	.main {
		min-height: 0;
		overflow: hidden;
		padding: var(--gap) var(--page-gutter) var(--gap);
		display: flex;
		flex-direction: column;
	}

	.main :global(.editor),
	.main :global(.empty) {
		flex: 1;
		min-height: 0;
	}

	@media (max-width: 880px) {
		.body {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(12rem, 30vh) 1fr;
		}
	}
</style>
