<script lang="ts">
	import { onMount } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { Button, BusyOverlay, SidePanel } from "../../ui";
	import * as api from "../../lib/api";
	import { toast } from "../../lib/toast.svelte";
	import type {
		InventoryItem,
		MenuItem,
		MenuSection,
		PublishTarget,
	} from "../../lib/types";
	import { publishPendingCount } from "../../lib/types";
	import { Icon } from "../../shell";
	import {
		loginNext,
		itemMatchesKey,
		itemSlug,
		leaveEditor,
		menuItemPath,
		menuListPath,
		menuNewPath,
		menuTabPath,
		namesClash,
		navigate,
		parseShellPath,
		editorKey,
	} from "../../lib/nav";
	import { setCrumbLeaf } from "../../lib/crumbs.svelte";
	import { unsaved, rememberBlockedNav } from "../../lib/unsaved.svelte";
	import { restoreGridScroll, parkGridScroll, unparkGridScroll } from "../../lib/grid-scroll";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../../lib/viewport.svelte";
	import {
		flattenMenuSections,
		removeItemFromSections,
		upsertItemInSections,
	} from "../../lib/menu-sections";
	import MenuItemsGrid from "./MenuItemsGrid.svelte";
	import RecipeEditor from "./RecipeEditor.svelte";
	import SpecBook from "./SpecBook.svelte";
	import PublishPanel from "./PublishPanel.svelte";
	import SectionsPanel from "./SectionsPanel.svelte";

	let { path = "/menu" }: { path?: string } = $props();

	/** Soft settle — matches theme `--ease`. */
	function easeOut(t: number): number {
		return 1 - Math.pow(1 - t, 3.2);
	}

	const reduced =
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const fadeMs = reduced ? 0 : 180;
	const flyMs = reduced ? 0 : 320;
	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	let sections = $state<MenuSection[]>([]);
	let inventory = $state<InventoryItem[]>([]);
	let selectedId = $state<string | null>(null);
	let item = $state<MenuItem | null>(null);
	let detailOpen = $state(false);
	let listPaneEl = $state<HTMLDivElement | undefined>();
	let publishOpen = $state(false);
	let sectionsOpen = $state(false);
	let query = $state("");
	let publishTarget = $state<PublishTarget>(
		(localStorage.getItem("gwenda-ops-menu-publish") as PublishTarget) ||
			"staging",
	);
	let bookMode = $state(false);
	let loadError = $state("");
	let busy = $state(true);
	let busyLabel = $state("Loading…");
	const loading = $derived(busy && busyLabel === "Loading…");
	let editorCleanToken = $state(0);
	let needsAuth = $state(false);
	let authPassword = $state("");
	let authError = $state("");
	let missingId = $state("");
	let appliedPath = "";

	const menuRoute = $derived(parseShellPath(path));
	const editorTab = $derived(menuRoute.tab || "details");
	const tabBase = $derived(
		menuRoute.isNew || (detailOpen && item && !item._id)
			? menuNewPath()
			: menuRoute.slug
				? `/menu/${encodeURIComponent(menuRoute.slug)}`
				: menuNewPath(),
	);

	function drinkTabPath(tab = editorTab) {
		if (menuRoute.isNew || (detailOpen && item && !item._id)) {
			return menuNewPath(tab);
		}
		if (item?.name?.trim() && item._id) {
			return menuItemPath(item.name, tab);
		}
		if (menuRoute.slug) return menuTabPath(`/menu/${menuRoute.slug}`, tab);
		return menuNewPath(tab);
	}

	function setEditorTab(id: string) {
		navigate(drinkTabPath(id));
	}

	function allItems(): MenuItem[] {
		return flattenMenuSections(sections).flatMap((section) =>
			(section.items || []).map((row) => ({ ...row, section })),
		);
	}

	const publishPending = $derived(publishPendingCount(allItems()));

	function firstSectionId(): string {
		return flattenMenuSections(sections)[0]?._id || "";
	}

	function findById(id: string | null) {
		if (!id) return null;
		return allItems().find((row) => row._id === id) || null;
	}

	function findByKey(key: string | null) {
		if (!key) return null;
		return allItems().find((row) => itemMatchesKey(row, key)) || null;
	}

	async function loadMenu() {
		const [menuData, inventoryData] = await Promise.all([
			api.getMenu(),
			api.getInventory(false).catch(() => ({ items: [] as InventoryItem[] })),
		]);
		sections = menuData.sections || [];
		inventory = inventoryData.items || [];
		needsAuth = false;
		loadError = "";
		if (selectedId && detailOpen) {
			item = findById(selectedId);
		}
	}

	async function runLoad(asReload = false) {
		try {
			busy = true;
			busyLabel = "Loading…";
			await loadMenu();
			return true;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to load menu.";
			if (message.startsWith("auth:")) {
				needsAuth = true;
				loadError = "";
				window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/menu"))}`;
				return false;
			}
			if (asReload) {
				toast.error(message);
			} else {
				loadError = message;
			}
			return false;
		} finally {
			busy = false;
		}
	}

	async function submitAuth() {
		authError = "";
		try {
			await api.login(authPassword, loginNext("/menu"));
			authPassword = "";
			await loadMenu();
		} catch (err) {
			authError = err instanceof Error ? err.message : "Login failed.";
		}
	}

	function goLogin() {
		const next = encodeURIComponent(loginNext("/menu"));
		location.assign(`/api/auth/login?next=${next}`);
	}

	function blankItem(): MenuItem {
		return {
			name: "",
			sectionId: firstSectionId(),
			drinkType: "cocktail",
			ingredients: [],
			onDigitalMenu: true,
		};
	}

	function openItem(next: MenuItem, skipNav = false) {
		parkGridScroll("menu-list", listPaneEl);
		selectedId = next._id || null;
		item = {
			...next,
			sectionId:
				next.sectionId || next.section?._ref || next.section?._id || "",
			ingredients: next.ingredients || [],
		};
		detailOpen = true;
		missingId = "";
		if (!skipNav) {
			navigate(next.name?.trim() ? menuItemPath(next.name) : menuNewPath());
		}
	}

	function restoreListScroll() {
		restoreGridScroll(listPaneEl, "menu-list", [
			0,
			16,
			50,
			fadeMs + 20,
			fadeMs + 80,
			fadeMs + 180,
			fadeMs + 320,
			fadeMs + 500,
		]);
		window.setTimeout(() => unparkGridScroll("menu-list"), fadeMs + 520);
	}

	function backToGrid(opts: { force?: boolean } = {}) {
		leaveEditor(menuListPath(), opts);
	}

	function newItem() {
		navigate(menuNewPath());
	}

	async function save() {
		if (!item || busy) return;
		const clash = allItems().find(
			(row) => row._id !== item?._id && namesClash(row.name, item?.name),
		);
		if (clash) {
			toast.error("A drink with that name already exists.");
			return;
		}
		try {
			busy = true;
			busyLabel = "Saving…";
			const payload = {
				name: item.name,
				sectionId: item.sectionId,
				price: item.price,
				priceAlt: item.priceAlt,
				drinkType: item.drinkType || "cocktail",
				notes: item.notes,
				glassware: item.glassware,
				ice: item.ice,
				garnish: item.garnish,
				onDigitalMenu: item.onDigitalMenu !== false,
				description: item.description,
				method: item.method,
				abv: item.abv,
				volume: item.volume,
				producer: item.producer,
				ingredients: item.ingredients || [],
				analysisNote: item.analysisNote ?? null,
			};
			const existing = item._id;
			const data = existing
				? await api.updateItem(existing, payload)
				: await api.createItem(payload);
			const saved = data.item;
			if (saved) {
				sections = upsertItemInSections(sections, saved);
				selectedId = saved._id || existing || null;
				item = findById(selectedId) || saved;
			} else {
				selectedId = existing || null;
				await loadMenu();
				item = findById(selectedId) || item;
			}
			detailOpen = true;
			editorCleanToken += 1;
			const savedName = item?.name || payload.name;
			if (savedName) {
				navigate(menuItemPath(savedName, editorTab), { replace: true, force: true });
			}
			toast.ok("Saved. Publish when you want guests to see this.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Save failed.");
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!item?._id) {
			backToGrid();
			return;
		}
		if (busy) return;
		try {
			busy = true;
			busyLabel = "Deleting…";
			await api.deleteItem(item._id);
			sections = removeItemFromSections(sections, item._id);
			backToGrid();
			toast.ok("Deleted.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Delete failed.");
		} finally {
			busy = false;
		}
	}

	async function applyPhotoItem(next: MenuItem | undefined) {
		if (next) {
			const current = findById(selectedId) || item;
			const merged = {
				...current,
				...next,
				image: next.image,
				ingredients: current?.ingredients || next.ingredients || [],
			};
			sections = upsertItemInSections(sections, merged);
			item = findById(selectedId) || merged;
			return;
		}
		await loadMenu();
		item = findById(selectedId);
	}

	async function onPhoto(file: File) {
		if (!item?._id) {
			toast.error("Save the drink first, then add a photo.");
			return;
		}
		if (busy) return;
		const form = new FormData();
		form.set("itemId", item._id);
		form.set("alt", item.name || "");
		form.set("file", file);
		try {
			busy = true;
			busyLabel = "Uploading photo…";
			const data = await api.uploadPhoto(form);
			await applyPhotoItem(data.item);
			toast.ok("Photo saved.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Upload failed.");
		} finally {
			busy = false;
		}
	}

	async function onPhotoRemove() {
		if (!item?._id || busy) return;
		try {
			busy = true;
			busyLabel = "Removing photo…";
			const data = await api.deletePhoto(item._id);
			await applyPhotoItem(data.item);
			toast.ok("Photo removed.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not remove photo.");
		} finally {
			busy = false;
		}
	}

	async function publish() {
		if (busy) return;
		if (
			publishTarget === "production" &&
			!confirm(
				"Update the live website menu? Guests will see these changes once the site finishes rebuilding.",
			)
		) {
			return;
		}
		try {
			busy = true;
			busyLabel = "Updating website…";
			const data = await api.publishMenu(publishTarget);
			await loadMenu();
			if (selectedId && detailOpen) {
				item = findById(selectedId) || item;
			}
			const where =
				(data.target || publishTarget) === "production"
					? "live website"
					: "preview site";
			const synced = data.sync?.synced?.length || 0;
			const missing = data.sync?.missing || [];
			if (missing.length) {
				toast.error(
					`Updated ${synced} item(s) on the ${where}, but ${missing.length} could not be matched: ${missing.join(", ")}.`,
				);
			} else if (!synced) {
				toast.ok(`Nothing to send to the ${where}.`);
			} else {
				toast.ok(
					`Website update started for the ${where}${
						synced ? ` (${synced} item${synced === 1 ? "" : "s"})` : ""
					}. It may take a minute to appear.`,
				);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Update failed.");
		} finally {
			busy = false;
		}
	}

	function openPublish() {
		sectionsOpen = false;
		publishOpen = true;
	}

	function closePublish() {
		publishOpen = false;
	}

	function openSections() {
		publishOpen = false;
		sectionsOpen = true;
	}

	function closeSections() {
		sectionsOpen = false;
	}

	function reloadMenu() {
		void runLoad(true);
	}

	async function refreshEditor() {
		if (!item?._id) return;
		const ok = await runLoad(true);
		if (ok) editorCleanToken += 1;
	}

	onMount(() => {
		void runLoad();
		return () => setCrumbLeaf("");
	});

	$effect(() => {
		if (!publishOpen && !sectionsOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				if (publishOpen) closePublish();
				if (sectionsOpen) closeSections();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	$effect(() => {
		const route = menuRoute;
		void sections;
		if (route.page !== "menu") return;

		if (
			!unsaved.allowLeave &&
			unsaved.dirty &&
			detailOpen &&
			item
		) {
			const stay = item._id
				? `menu:${itemSlug(item.name || "") || "item"}`
				: "menu:new";
			if (editorKey(path) !== stay) {
				rememberBlockedNav(path);
				const stayPath =
					appliedPath && editorKey(appliedPath) === stay
						? appliedPath
						: item._id
							? menuItemPath(item.name || "", editorTab)
							: menuNewPath(editorTab);
				navigate(stayPath, { replace: true, force: true });
				unsaved.onBlock?.();
				return;
			}
		}

		if (route.isNew) {
			missingId = "";
			const canonical = menuNewPath(route.tab);
			if (canonical !== path) {
				navigate(canonical, { replace: true, force: true });
			}
			if (detailOpen && item && !item._id) {
				appliedPath = path;
				if (!item.sectionId && firstSectionId()) {
					item = { ...item, sectionId: firstSectionId() };
				}
				return;
			}
			if (appliedPath === path && detailOpen && item) {
				if (!item.sectionId && firstSectionId()) {
					item = { ...item, sectionId: firstSectionId() };
				}
				return;
			}
			appliedPath = path;
			openItem(blankItem(), true);
			selectedId = null;
			return;
		}

		if (route.slug) {
			const found = findByKey(route.slug);
			if (found) {
				appliedPath = path;
				missingId = "";
				const canonical = menuItemPath(found.name, route.tab);
				if (canonical && canonical !== path) {
					navigate(canonical, { replace: true, force: true });
				}
				if (selectedId !== found._id || !detailOpen) openItem(found, true);
				return;
			}
			if (!sections.length && !loadError) return;
			if (detailOpen && itemMatchesKey(item, route.slug)) {
				appliedPath = path;
				return;
			}
			appliedPath = path;
			missingId = route.slug;
			detailOpen = false;
			item = null;
			selectedId = null;
			return;
		}

		appliedPath = path;
		missingId = "";
		const wasOpen = detailOpen;
		detailOpen = false;
		// Keep `item` through the detail outro so the leaving pane stays stable.
		if (wasOpen) {
			restoreListScroll();
			window.setTimeout(() => {
				if (!detailOpen) item = null;
			}, fadeMs + 40);
		} else {
			item = null;
		}
	});

	$effect(() => {
		const route = menuRoute;
		if (route.isNew) {
			setCrumbLeaf(item?.name?.trim() || "New item");
		} else if (route.slug) {
			setCrumbLeaf(item?.name?.trim() || (missingId ? "Not found" : ""));
		} else {
			setCrumbLeaf("");
		}
	});
</script>

{#if needsAuth}
	<div class="auth">
		<p class="eyebrow">Gwenda · internal</p>
		<h1>Sign in</h1>
		<p class="muted">Your session expired or is missing. Sign in to continue.</p>
		<div class="auth-form">
			<Button variant="primary" onclick={goLogin}>Continue with Google</Button>
			<details class="password-fallback">
				<summary>Password instead</summary>
				<form
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
					<Button variant="outline" type="submit">Enter</Button>
				</form>
			</details>
			{#if authError}
				<p class="auth-error">{authError}</p>
			{/if}
		</div>
	</div>
{:else if bookMode}
	<div
		class="book-wrap"
		in:fly={{ y: 8, duration: flyMs, easing: easeOut }}
	>
		<SpecBook
			items={allItems()}
			{inventory}
			onclose={() => (bookMode = false)}
		/>
	</div>
{:else}
	<div class="workbench">
		<div class="stage">
			{#if loadError}
				<p class="load-error">{loadError}</p>
			{:else if missingId}
				<div class="pane list">
					<div class="missing">
						<p>That drink is not on the menu.</p>
						<Button variant="outline" size="sm" onclick={backToGrid}>
							Back to recipes
						</Button>
					</div>
				</div>
			{:else}
				<div
					class="pane list"
					class:parked={detailOpen || Boolean(item)}
					bind:this={listPaneEl}
					inert={detailOpen || item ? true : undefined}
					aria-hidden={detailOpen || item ? true : undefined}
				>
					<header class="top">
						<div class="tools">
							<Button
								variant="outline"
								size="sm"
								disabled={busy}
								busy={loading}
								onclick={reloadMenu}
							>
								{#snippet icon()}
									<Icon name="refresh" size={15} />
								{/snippet}
								Reload
							</Button>
							{#if !phone.matches}
								<Button
									variant="outline"
									size="sm"
									disabled={busy}
									onclick={() => (bookMode = true)}
								>
									{#snippet icon()}
										<Icon name="print" size={15} />
									{/snippet}
									Print
								</Button>
							{/if}
							<Button
								variant="outline"
								size="sm"
								disabled={busy}
								onclick={openSections}
							>
								{#snippet icon()}
									<Icon name="list" size={15} />
								{/snippet}
								Sections
							</Button>
							<Button
								variant="primary"
								size="sm"
								disabled={busy}
								onclick={openPublish}
							>
								{#snippet icon()}
									<Icon name="upload" size={15} />
								{/snippet}
								{publishPending
									? `Publish · ${publishPending}`
									: "Publish"}
							</Button>
						</div>
					</header>
					<div class="body">
						<MenuItemsGrid
							{sections}
							{inventory}
							bind:query
							{selectedId}
							onview={openItem}
							onnew={newItem}
						/>
					</div>
				</div>
				{#if detailOpen && item}
					<div
						class="pane detail"
						in:fly={{ y: 10, duration: flyMs, easing: easeOut }}
						out:fade={{ duration: fadeMs, easing: easeOut }}
					>
						<RecipeEditor
							bind:item
							{sections}
							bind:inventory
							menuItems={allItems()}
							{busy}
							{busyLabel}
							cleanToken={editorCleanToken}
							tab={editorTab}
							{tabBase}
							onsave={save}
							ondelete={remove}
							onphoto={onPhoto}
							onphotoremove={onPhotoRemove}
							onback={backToGrid}
							onrefresh={refreshEditor}
							ontab={setEditorTab}
						/>
					</div>
				{/if}
			{/if}
			<BusyOverlay active={loading} label={busyLabel} />
		</div>

		<SidePanel
			open={sectionsOpen}
			onclose={closeSections}
			ariaLabel="Menu sections"
			width="min(28rem, 100%)"
		>
			<SectionsPanel
				{sections}
				{busy}
				onchanged={loadMenu}
				onclose={closeSections}
			/>
		</SidePanel>
		<SidePanel
			open={publishOpen}
			onclose={closePublish}
			ariaLabel="Update website menu"
		>
			<PublishPanel
				bind:publishTarget
				items={allItems()}
				{busy}
				{busyLabel}
				onpublish={publish}
				onclose={closePublish}
			/>
		</SidePanel>
	</div>
{/if}

<style>
	.auth {
		flex: 1;
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
		font-size: var(--text-md);
	}

	.auth-form {
		display: grid;
		gap: var(--gap-sm);
		width: min(100%, 18rem);
		margin: var(--gap) auto 0;
		justify-items: stretch;
	}

	.password-fallback {
		text-align: left;
		font-size: var(--text);
		color: var(--muted-foreground);
	}

	.password-fallback summary {
		cursor: pointer;
		margin-bottom: 0.5rem;
	}

	.password-fallback form {
		display: grid;
		gap: var(--gap-xs);
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
		font-size: var(--text);
	}

	.workbench {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: var(--background);
	}

	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
	}

	.pane {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--background);
	}

	.pane.parked {
		/* Keep the list laid out and scrolled under the detail.
		   visibility:hidden makes AG Grid dump its viewport. */
		pointer-events: none;
		z-index: 0;
	}

	.pane.detail {
		z-index: 1;
	}

	.book-wrap {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm) var(--gap);
		align-items: center;
		justify-content: flex-end;
		flex-shrink: 0;
		padding: 0.65rem var(--page-gutter);
		background: var(--background);
		border-bottom: 1px solid var(--border);
		min-height: calc(var(--topbar-h, 3.25rem));
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
		justify-content: flex-end;
	}

	@media (max-width: 900px) {
		.top {
			padding: 0.55rem var(--page-gutter);
			min-height: 0;
		}
	}

	.load-error {
		padding: 2rem var(--page-gutter);
		color: var(--destructive);
	}

	.missing {
		display: grid;
		gap: var(--gap-sm);
		place-content: center;
		justify-items: center;
		height: 100%;
		padding: 2rem var(--page-gutter);
		text-align: center;
		color: var(--muted-foreground);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.pane.detail :global(.editor) {
		flex: 1;
		min-height: 0;
	}
</style>
