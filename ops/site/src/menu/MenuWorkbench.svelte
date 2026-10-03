<script lang="ts">
	import { onMount } from "svelte";
	import { fade, fly } from "svelte/transition";
	import {
		Button,
		BusyOverlay,
		Chip,
		EmptyState,
		FilterBar,
		FilterField,
		PageHeader,
		Segmented,
		SidePanel,
	} from "../ui";
	import DensityToggle from "../ui/DensityToggle.svelte";
	import { densityPref, listViewPref } from "../ui/list-prefs.svelte";
	import type { ListView } from "../ui/view-prefs";
	import type { FilterChip } from "../ui/filters";
	import { MENU_LIST_SORTS, type MenuListSort } from "./menu-list";
	import * as api from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { refreshSitePending } from "../website/site-pending.svelte";
	import type { InventoryItem } from "../inventory/types";
	import type { DrinkType, MenuItem, MenuSection, PosMenu } from "./types";
	import { publishPendingCount } from "./publish";
	import { menuItemPayload } from "./item-payload";
	import { defaultPosMenus } from "./types";
	import { Icon } from "../app/shell";
	import {
		itemMatchesKey,
		itemSlug,
		leaveEditor,
		menuItemPath,
		menuItemPrintPath,
		menuListPath,
		menuNewPath,
		menuPrintPath,
		menuTabPath,
		namesClash,
		navigate,
		parseShellPath,
		editorKey,
	} from "../app/nav";
	import { setCrumbLeaf } from "../ui/crumbs.svelte";
	import { unsaved, rememberBlockedNav } from "../ui/unsaved.svelte";
	import { restoreGridScroll, parkGridScroll, unparkGridScroll } from "../ui/grid-scroll";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import {
		flattenMenuSections,
		removeItemFromSections,
		upsertItemInSections,
	} from "./menu-sections.js";
	import MenuItemsGrid from "./MenuItemsGrid.svelte";
	import RecipeEditor from "./RecipeEditor.svelte";
	import SpecBook from "./SpecBook.svelte";
	import PublishPanel from "./PublishPanel.svelte";

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
	/** Table or cards, and row spacing, remembered on this device. */
	const view = listViewPref("menu-items", phone);
	const density = densityPref("menu-items");
	const VIEW_ITEMS = [
		{ id: "table", label: "Table" },
		{ id: "cards", label: "Cards" },
	] as const;

	let sections = $state<MenuSection[]>([]);
	let posMenus = $state<PosMenu[]>([]);
	let inventory = $state<InventoryItem[]>([]);
	let selectedId = $state<string | null>(null);
	let item = $state<MenuItem | null>(null);
	let detailOpen = $state(false);
	let listPaneEl = $state<HTMLDivElement | undefined>();
	let publishOpen = $state(false);
	let query = $state("");
	/** Phone list order. The desktop grid sorts by its column headers. */
	let sort = $state<MenuListSort>("section");
	let itemCount = $state(0);
	const sortChips = $derived.by((): FilterChip[] => {
		if (sort === "section") return [];
		const label = MENU_LIST_SORTS.find((row) => row.id === sort)?.label || "";
		return [{ key: "sort", label: `By ${label.toLowerCase()}`, onremove: () => (sort = "section") }];
	});
	let loadError = $state("");
	let busy = $state(true);
	let busyLabel = $state("Loading…");
	const loading = $derived(busy && busyLabel === "Loading…");
	let editorCleanToken = $state(0);
	let missingId = $state("");
	let appliedPath = "";

	const menuRoute = $derived(parseShellPath(path));
	const bookMode = $derived(Boolean(menuRoute.print));
	// spa-path normalizes the filter to "all" or a drink type.
	const printFilter = $derived(
		(menuRoute.printFilter || "cocktail") as "all" | DrinkType,
	);
	const printSlug = $derived(menuRoute.print && menuRoute.slug ? menuRoute.slug : "");
	const printBookItems = $derived(
		printSlug
			? allItems().filter((row) => itemMatchesKey(row, printSlug))
			: allItems(),
	);
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

	const publishPending = $derived(publishPendingCount(allItems(), "production"));

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
		posMenus = menuData.posMenus || [];
		inventory = inventoryData.items || [];
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

	function blankItem(): MenuItem {
		return {
			name: "",
			sectionId: firstSectionId(),
			drinkType: "cocktail",
			ingredients: [],
			onDigitalMenu: true,
			onPrintMenu: true,
			posMenus: defaultPosMenus(posMenus),
		};
	}

	function openItem(
		next: MenuItem,
		opts: { skipNav?: boolean; tab?: string } = {},
	) {
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
		if (!opts.skipNav) {
			navigate(
				next.name?.trim()
					? menuItemPath(next.name, opts.tab)
					: menuNewPath(opts.tab),
			);
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

	async function save(opts?: { after?: string }): Promise<boolean> {
		if (!item || busy) return false;
		const clash = allItems().find(
			(row) => row._id !== item?._id && namesClash(row.name, item?.name),
		);
		if (clash) {
			toast.error("A drink with that name already exists.");
			return false;
		}
		try {
			busy = true;
			busyLabel = "Saving…";
			const payload = menuItemPayload(item);
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
				const dest = opts?.after ?? menuItemPath(savedName, editorTab);
				navigate(dest, { replace: true, force: true });
			}
			toast.ok("Saved. Publish when you want guests to see this.");
			return true;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Save failed.");
			return false;
		} finally {
			busy = false;
		}
	}

	async function goToPrint(printPath: string) {
		if (busy) return;
		if (unsaved.dirty && detailOpen && item) {
			const ok = await save({ after: printPath });
			if (!ok) return;
			return;
		}
		navigate(printPath);
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
			if (!data.item?.image?.asset?.url && !data.url) {
				throw new Error(
					"Upload finished but no photo URL came back. Check the Photo field on Menu Items.",
				);
			}
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
		try {
			busy = true;
			busyLabel = "Updating website…";
			const data = await api.publishMenu();
			await loadMenu();
			if (selectedId && detailOpen) {
				item = findById(selectedId) || item;
			}
			for (const warning of data.warnings || []) toast.info(warning);
			const missing = data.sync?.missing || [];
			if (missing.length) {
				toast.error(`${missing.length} need a menu section before they can go on the website: ${missing.join(", ")}.`);
			}
			if (!data.published) {
				if (!missing.length) toast.ok("The website already shows this menu.");
			} else {
				toast.ok(
					data.building
						? "Menu on the website. The menu page shows it in about 2 minutes."
						: "Menu on the website. The menu page shows it after the next website update.",
				);
				void refreshSitePending();
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Update failed.");
		} finally {
			busy = false;
		}
	}

	function openPublish() {
		publishOpen = true;
	}

	function closePublish() {
		publishOpen = false;
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
		if (!publishOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				closePublish();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	$effect(() => {
		const route = menuRoute;
		void sections;
		if (route.page !== "menu") return;

		if (route.print) {
			appliedPath = path;
			missingId = "";
			detailOpen = false;
			item = null;
			selectedId = null;
			if (!route.slug) {
				const canonical = menuPrintPath(route.printFilter);
				if (canonical !== path) {
					navigate(canonical, { replace: true, force: true });
				}
			} else {
				const found = findByKey(route.slug);
				if (found) {
					const canonical = menuItemPrintPath(found.name);
					if (canonical && canonical !== path) {
						navigate(canonical, { replace: true, force: true });
					}
				} else if (sections.length || loadError) {
					missingId = route.slug;
				}
			}
			return;
		}

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
			openItem(blankItem(), { skipNav: true });
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
				if (selectedId !== found._id || !detailOpen) {
					openItem(found, { skipNav: true });
				}
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

{#snippet sortFilter()}
	{#if phone.matches}
		<FilterField label="Layout">
			{#each VIEW_ITEMS as option (option.id)}
				<Chip pressed={view.value === option.id} onclick={() => (view.value = option.id)}>{option.label}</Chip>
			{/each}
		</FilterField>
	{/if}
	<FilterField label="Sort">
		{#each MENU_LIST_SORTS as option (option.id)}
			<Chip pressed={sort === option.id} onclick={() => (sort = option.id)}>{option.label}</Chip>
		{/each}
	</FilterField>
{/snippet}

{#if bookMode}
	<div class="book-wrap">
		<SpecBook
			items={printBookItems}
			{inventory}
			filter={printSlug ? "all" : printFilter}
			single={Boolean(printSlug)}
			onfilter={printSlug ? undefined : (next) => navigate(menuPrintPath(next))}
			onclose={() =>
				navigate(
					printSlug
						? printBookItems[0]?.name
							? menuItemPath(printBookItems[0].name)
							: `/menu/${encodeURIComponent(printSlug)}`
						: menuListPath(),
				)}
		/>
	</div>
{:else}
	<div class="workbench">
		<div class="stage">
			{#if loadError}
				<EmptyState tone="error" title="Could not load the menu" text={loadError}>
					{#snippet action()}
						<Button variant="outline" size="sm" onclick={() => void runLoad()}>Try again</Button>
					{/snippet}
				</EmptyState>
			{:else if missingId}
				<div class="pane list">
					<div class="missing">
						<p>That drink is not on the menu.</p>
						<Button variant="outline" size="sm" onclick={() => backToGrid()}>
							Back to menu items
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
					<div class="head">
						<PageHeader title="Menu items">
							{#snippet actions()}
								<Button
									variant="outline"
									size="sm"
									data-compact
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
										onclick={() => goToPrint(menuPrintPath())}
									>
										{#snippet icon()}
											<Icon name="print" size={15} />
										{/snippet}
										Print
									</Button>
								{/if}
								<Button variant="outline" size="sm" disabled={busy} onclick={newItem}>
									{#snippet icon()}
										<Icon name="plus" size={15} />
									{/snippet}
									New item
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
							{/snippet}
							{#snippet toolbar()}
								<FilterBar
									bind:query
									placeholder="Search name, ingredients, description"
									ariaLabel="Search drinks"
									searchWidth="26rem"
									searchCount={query.trim() ? itemCount : undefined}
									active={sort === "section" ? 0 : 1}
									chips={sortChips}
									onclearfilters={() => (sort = "section")}
									filters={phone.matches || view.value === "cards" ? sortFilter : undefined}
								>
									{#snippet end()}
										<p class="meta">{itemCount} item{itemCount === 1 ? "" : "s"}</p>
										{#if view.value === "table"}
											<DensityToggle bind:value={density.value} />
										{/if}
										<Segmented
											value={view.value}
											items={VIEW_ITEMS}
											size="sm"
											ariaLabel="Layout"
											onChange={(id) => (view.value = id as ListView)}
										/>
									{/snippet}
								</FilterBar>
							{/snippet}
						</PageHeader>
					</div>
					<div class="body">
						<MenuItemsGrid
							{sections}
							{inventory}
							{query}
							{sort}
							bind:count={itemCount}
							{loading}
							{selectedId}
							view={view.value}
							density={density.value}
							onview={(row, tab) => openItem(row, { tab })}
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
							{posMenus}
							{busy}
							{busyLabel}
							cleanToken={editorCleanToken}
							tab={editorTab}
							{tabBase}
							onsave={save}
							onprint={() =>
								item?.name?.trim() &&
								goToPrint(menuItemPrintPath(item.name))}
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
			<!-- First load shows skeleton rows; the overlay covers a reload. -->
			<BusyOverlay active={loading && itemCount > 0} label={busyLabel} />
		</div>

		<SidePanel
			open={publishOpen}
			onclose={closePublish}
			ariaLabel="Update website menu"
		>
			<PublishPanel
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

	/* The grid runs edge to edge; only the header is padded. */
	.head {
		flex-shrink: 0;
		padding: var(--page-gutter) var(--page-gutter) 0;
	}

	.head :global(.page-header) {
		margin-bottom: var(--space-4);
	}


	.missing {
		display: grid;
		gap: var(--space-3);
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
