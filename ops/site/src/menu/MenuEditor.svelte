<script lang="ts">
	/**
	 * A menu's page (#305): its name, drinks or food, dates, days and pop-up
	 * kitchen (Details), and what's on it (Items): its sections and their
	 * items, laid out and shaped as on the website (MenuItemsList). /menus/new starts a menu;
	 * /menus/new?popup=<id> starts it from a pop-up kitchen's name, nights and
	 * cooking days (Events → Add menu), for the owner to narrow down.
	 *
	 * The whole page is one draft (menu-page-draft.svelte.ts): nothing is
	 * written until Save menu, which writes it all in order. It sits in the
	 * same card as the events editor (EditorCard).
	 */
	import { onDestroy } from "svelte";
	import {
		Badge,
		Button,
		ConfirmDialog,
		DateField,
		EditorShell,
		EmptyState,
		Field,
		FormSection,
		HelpDrawer,
		NativeSelect,
		Segmented,
		Skeleton,
		TextField,
		UpdateWebsiteDialog,
	} from "../ui";
	import { Icon } from "../app/shell";
	import * as api from "../app/api";
	import { leaveEditor, menuPagePath, menusListPath, navigate, parseShellPath } from "../app/nav";
	import { setCrumbLeaf } from "../ui/crumbs.svelte";
	import { provideHelp } from "../ui/help.svelte";
	import { toast } from "../ui/toast.svelte";
	import { beginLeave, clearUnsavedGuard, setUnsavedGuard, takeBlockedNav } from "../ui/unsaved.svelte";
	import MenuItemsList from "./MenuItemsList.svelte";
	import MenuDaysPicker from "./MenuDaysPicker.svelte";
	import { MENU_STATUS_TONES, blankMenu, menuDraft, menuPayload, popupDraft } from "./menu-form";
	import { menuDaysLabel } from "./menu-days.js";
	import { MenuPageDraft, saveReport } from "./menu-page-draft.svelte";
	import { MENU_PAGE_HELP } from "./menu-page-help";
	import { apiSavePort } from "./menu-page-save";
	import { menuSiteBuild, menuWebsiteStatus, type MenuWebsiteChanges } from "./menu-website-status";
	import { followMenuSaves, publishedToasts } from "./menu-website-follow";
	import { getSitePendingState, refreshSitePending } from "../website/site-pending.svelte";
	import { SECTION_KIND_ITEMS, type Menu, type MenuPopupRun, type MenuSection } from "./types";

	let { path, open = true }: { path: string; /** Whether the menu shows (MenusPage keeps it mounted so it can zoom in and out). */ open?: boolean } = $props();

	const route = $derived(parseShellPath(path));
	const isNew = $derived(Boolean(route.isNew));
	const menuId = $derived(route.isNew ? "" : String(route.slug || ""));

	const help = provideHelp("Menu", MENU_PAGE_HELP);

	let menu = $state<Menu | null>(null);
	let sections = $state<MenuSection[]>([]);
	let menus = $state<Menu[]>([]);
	let popups = $state<MenuPopupRun[]>([]);
	/** The page as a draft: the details, the sections and the items. */
	const page = new MenuPageDraft();
	let loading = $state(true);
	let error = $state("");
	let saving = $state(false);
	let deleting = $state(false);
	let copying = $state(false);
	let discardOpen = $state(false);
	let deleteOpen = $state(false);

	const dirty = $derived(page.dirty);
	/** The item dialog is open with changes not yet Done (MenuItemsList). */
	let itemDirty = $state(false);
	/** Which part of the page shows: what's on it, or its details. */
	let tab = $state("items");
	const tabItems = $derived([
		{ id: "items", label: page.itemsDirty ? "Items •" : "Items" },
		{ id: "details", label: page.detailsDirty ? "Details •" : "Details" },
	]);
	// Another menu opens on its items.
	$effect(() => {
		void menuId;
		tab = "items";
	});
	const canSave = $derived(!saving && Boolean(page.details.name.trim()) && (isNew || dirty));
	const popupOptions = $derived([
		{ value: "", label: "None" },
		...popups.map((popup) => ({ value: popup.id, label: popup.name })),
	]);
	const deleteReason = $derived(
		isNew ? "Save it first" : sections.length ? "Move its sections to another menu first" : undefined,
	);

	// It copies the menu as saved, so changes not yet saved come first.
	const copyReason = $derived(isNew ? "Save it first" : dirty ? "Save your changes first" : undefined);

	function popupFromAddress(): string {
		if (typeof location === "undefined") return "";
		return new URLSearchParams(location.search).get("popup") || "";
	}

	// Update website (#305): saving never reaches the website; this puts every menu there.
	let websiteChanges = $state<MenuWebsiteChanges | null>(null);
	let checkingWebsite = $state(false);
	let putOpen = $state(false);
	let putting = $state(false);
	let putError = $state("");
	const website = $derived(
		menuWebsiteStatus({
			menuId,
			dirty: dirty || itemDirty,
			changes: websiteChanges,
			checking: checkingWebsite,
			site: menuSiteBuild(getSitePendingState().production),
		}),
	);

	/** What Update website would change now; the page asks again after a save or an update. */
	async function checkWebsite() {
		checkingWebsite = true;
		try {
			const { menus: byMenu, other, follows } = await api.getMenuWebsiteChanges();
			websiteChanges = { menus: byMenu || {}, other: other || 0, follows };
		} catch {
			websiteChanges = null;
		} finally {
			checkingWebsite = false;
		}
	}

	/** The same as Items' Update website: every menu change goes on the website, the menu page builds. */
	async function putOnWebsite() {
		if (putting) return;
		putting = true;
		putError = "";
		try {
			const data = await api.publishMenu();
			putOpen = false;
			publishedToasts(data);
			await refreshSitePending();
			void checkWebsite();
		} catch (err) {
			putError = err instanceof Error ? err.message : "Update failed.";
		} finally {
			putting = false;
		}
	}

	const namesOf = (list: Menu[]) => Object.fromEntries(list.map((entry) => [entry.id, entry.name]));

	async function load(id: string, fresh: boolean) {
		try {
			loading = true;
			error = "";
			if (fresh) {
				const data = await api.listMenus();
				menus = data.menus || [];
				popups = data.popups || [];
				menu = null;
				sections = [];
				const popup = popups.find((row) => row.id === popupFromAddress());
				page.load("", popup ? popupDraft(popup) : blankMenu(), [], namesOf(menus));
				setCrumbLeaf("");
				return;
			}
			const data = await api.getMenuPage(id);
			menu = data.menu;
			sections = data.sections || [];
			menus = data.menus || [];
			popups = data.popups || [];
			page.load(data.menu.id, menuDraft(data.menu), data.items || [], namesOf(menus));
			setCrumbLeaf(data.menu.name);
			websiteChanges = null;
			void checkWebsite();
			void refreshSitePending();
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't load this menu.";
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) void load(menuId, isNew);
		else setCrumbLeaf("");
	});

	/** Save menu: everything on the page, in order; a step that fails keeps the rest to save. */
	async function save(event?: Event) {
		event?.preventDefault();
		if (!canSave) return;
		saving = true;
		try {
			if (isNew) {
				const { menu: made } = await api.createMenu(menuPayload(page.details));
				page.savedDetails = { ...page.details, days: [...page.details.days] };
				toast.ok(`${made.name} added. Now give it its sections, under Items.`);
				navigate(menuPagePath(made.id), { replace: true, force: true });
				return;
			}
			const result = await page.save(apiSavePort(menuId));
			// What was saved goes on the website by itself (or waits, as the setting says).
			const followed = result.done.length ? await followMenuSaves() : null;
			try {
				const data = await api.getMenuPage(menuId);
				menu = data.menu;
				sections = data.sections || [];
				menus = data.menus || [];
				page.menuNames = namesOf(menus);
				page.settle(result, menuDraft(data.menu), data.items || []);
				setCrumbLeaf(data.menu.name);
			} catch (err) {
				toast.error(err instanceof Error ? `Saved, but couldn't load the menu again: ${err.message}` : "Couldn't load the menu again.");
			}
			if (result.failed) toast.error(saveReport(result));
			else if (followed && !followed.released) toast.ok("Menu saved. Update website puts it on the website.");
			else toast.ok("Menu saved. It goes on the website by itself in a few minutes.");
			void checkWebsite();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't save the menu.");
		} finally {
			saving = false;
		}
	}

	async function remove() {
		deleteOpen = false;
		if (!menu || deleting) return;
		deleting = true;
		try {
			await api.deleteMenu(menu.id);
			toast.ok(`${menu.name} deleted.`);
			void followMenuSaves();
			beginLeave();
			navigate(menusListPath(), { replace: true, force: true });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't delete the menu.");
		} finally {
			deleting = false;
		}
	}

	/** Copy menu: the next menu from this one, opened to set its dates. */
	async function copy() {
		if (!menu || copying || copyReason) return;
		copying = true;
		try {
			const { menu: made } = await api.copyMenu(menu.id);
			toast.ok(`${made.name} added, with ${menu.name}'s sections. Set its dates, then add its items.`);
			navigate(menuPagePath(made.id), { force: true });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't copy the menu.");
		} finally {
			copying = false;
		}
	}

	function back() {
		leaveEditor(menusListPath());
	}

	// Unsaved changes: leaving asks first, like any editor.
	$effect(() => {
		setUnsavedGuard(open && (dirty || itemDirty) && !saving, () => (discardOpen = true));
	});

	// Esc closes the menu, as it closes an event (leaving asks first when there are changes).
	$effect(() => {
		if (!open || typeof window === "undefined") return;
		function onKey(e: KeyboardEvent) {
			if (e.key !== "Escape" || e.defaultPrevented || saving || discardOpen || deleteOpen || putOpen) return;
			if (document.querySelector("[role=dialog], [role=menu], dialog[open]")) return;
			e.preventDefault();
			back();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	// Reload asks first too (the browser's own question).
	$effect(() => {
		if (!open || !(dirty || itemDirty) || typeof window === "undefined") return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	});

	onDestroy(() => {
		clearUnsavedGuard();
		setCrumbLeaf("");
	});

	function keepEditing() {
		discardOpen = false;
		takeBlockedNav();
	}

	function discardAndLeave() {
		discardOpen = false;
		beginLeave();
		const pending = takeBlockedNav();
		if (pending?.path) navigate(pending.path, { force: true, replace: pending.replace });
	}

	const heading = $derived(isNew ? page.details.name.trim() || "New menu" : menu?.name || "Menu");
	const subtitle = $derived(
		isNew
			? "Name it, say when it runs, then save it and add its sections."
			: menu
				? `${menu.datesLabel} · ${menu.daysLabel} · ${menu.itemCount} item${menu.itemCount === 1 ? "" : "s"}`
				: "",
	);
</script>

{#snippet menuKicker()}
	<p class="eyebrow">Menu</p>
	{#if menu}<Badge tone={MENU_STATUS_TONES[menu.status]} label={menu.statusLabel} />{/if}
	{#if menu && website.badge}<span class="phone-status"><Badge tone={website.badge.tone} label={website.badge.label} title={website.badge.title} /></span>{/if}
{/snippet}

{#snippet menuTools()}
	{#if menu}
		<!-- Beside the button on desktop; under the name's kicker on phones, where the row is short. -->
		{#if website.badge}<span class="desk-tool"><Badge tone={website.badge.tone} label={website.badge.label} title={website.badge.title} /></span>{/if}
		<Button
			variant="primary"
			size="sm"
			type="button"
			disabled={website.disabled || putting}
			reason={website.reason}
			title="Put the menus as saved on gwenda.co.uk."
			onclick={() => {
				putError = "";
				putOpen = true;
			}}
		>
			{#snippet icon()}<Icon name="upload" size={14} />{/snippet}
			Update website
		</Button>
	{/if}
{/snippet}

{#snippet menuTabs()}
	<Segmented bind:value={tab} items={tabItems} tone="soft" size="sm" ariaLabel="Menu sections" />
{/snippet}

<!-- The same editor card as an event's (EditorShell): its head, tabs, a body
     that scrolls inside it, and the save bar at its foot. -->
<EditorShell
	{open}
	backLabel="Menus"
	onclose={back}
	dirty={dirty || itemDirty}
	busy={saving}
	kicker={menuKicker}
	tools={menuTools}
	{heading}
	placeholder={isNew && !page.details.name.trim()}
	{subtitle}
	tabs={menu && !error ? menuTabs : undefined}
	actions={{
		saveLabel: isNew ? "Add menu" : "Save menu",
		savingLabel: isNew ? "Adding…" : "Saving…",
		saving,
		disabled: !canSave || deleting || copying || Boolean(error) || (loading && !menu && !isNew),
		dirty,
		onsave: () => void save(),
		overflow: [
			{
				label: "Copy menu",
				disabled: Boolean(copyReason) || copying,
				reason: copyReason,
				onselect: () => void copy(),
			},
			{
				label: "Delete menu",
				tone: "destructive",
				disabled: Boolean(deleteReason) || deleting,
				reason: deleteReason,
				onselect: () => (deleteOpen = true),
			},
		],
	}}
>
	{#if error}
		<div class="tab-body">
			<EmptyState tone="error" title="Couldn't load this menu" text={error}>
				{#snippet action()}
					<Button variant="outline" size="sm" onclick={() => void load(menuId, isNew)}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
				{/snippet}
			</EmptyState>
		</div>
	{:else if loading && !menu && !isNew}
		<div class="tab-body"><Skeleton rows={5} lines={1} label="Loading the menu…" /></div>
	{:else}
		<div class="tab-body">
			{#if menu && tab === "items"}
				<FormSection title="Items" description="A map of the menu, in its order. Click a section's name or line to change it, an item's pencil to edit it, and drag a section by its handle to move it. Nothing is saved until Save menu.">
					<MenuItemsList
						{page}
						menuName={menu.name}
						menuId={menu.id}
						menus={menus.map(({ id, name }) => ({ id, name }))}
						busy={saving}
						bind:dirty={itemDirty}
					/>
				</FormSection>
			{/if}

			{#if !menu || tab === "details"}
				<form class="menu-form" novalidate onsubmit={save}>
					<FormSection title="The menu" description="What it's called, and when guests can order from it.">
						<Field class="span-6" label="Name" for="menu-name" required hint="What guests see at the top, e.g. Brunch.">
							<TextField id="menu-name" size="sm" bind:value={page.details.name} placeholder="Chez Pickle" autocomplete="off" />
						</Field>
						<Field class="span-6" label="Drinks or food" for="menu-kind" hint="Food goes on the kitchen page, drinks on the bar page.">
							<Segmented bind:value={page.details.kind} items={SECTION_KIND_ITEMS} tone="soft" size="sm" ariaLabel="Drinks or food" />
						</Field>
						<Field class="span-3" label="Starts" for="menu-starts" optional hint="Empty: it's on already.">
							<DateField id="menu-starts" size="sm" bind:value={page.details.startsOn} />
						</Field>
						<Field class="span-3" label="Ends" for="menu-ends" optional hint="Empty: it keeps going.">
							<DateField id="menu-ends" size="sm" bind:value={page.details.endsOn} min={page.details.startsOn} />
						</Field>
						<Field
							class="span-6"
							label="Days"
							for="menu-days"
							hint={page.details.days.length ? `${menuDaysLabel(page.details.days)}. Pick none for every day.` : "Every day. Pick days to narrow it down."}
						>
							<MenuDaysPicker id="menu-days" bind:days={page.details.days} />
						</Field>
						<!-- Always there, so the form doesn't move when Drinks or Food is switched. -->
						<Field
							class="span-6"
							label="Pop-up kitchen"
							for="menu-popup"
							optional
							hint={page.details.kind === "kitchen"
								? "Whose food this is. Pop-up kitchens are added in Events."
								: "Only a Food menu can belong to a pop-up kitchen."}
						>
							<NativeSelect
								id="menu-popup"
								size="sm"
								bind:value={page.details.popupSeriesId}
								options={popupOptions}
								disabled={page.details.kind !== "kitchen"}
							/>
						</Field>
					</FormSection>
					<button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
				</form>
			{/if}
		</div>
	{/if}
</EditorShell>

<ConfirmDialog
	open={discardOpen}
	title="Discard unsaved changes?"
	message="You've changed this menu and haven't saved it. The changes will be lost."
	action="Discard"
	cancelLabel="Keep editing"
	oncancel={keepEditing}
	onconfirm={discardAndLeave}
/>
<ConfirmDialog
	open={deleteOpen}
	title={`Delete ${menu?.name || "this menu"}?`}
	message="It has no sections left, so nothing else goes with it. This can't be undone."
	action="Delete"
	oncancel={() => (deleteOpen = false)}
	onconfirm={() => void remove()}
/>

<UpdateWebsiteDialog
	open={putOpen}
	{putting}
	error={putError}
	message="Every menu goes on gwenda.co.uk as saved, for everyone, now: the menu page shows it in about 2 minutes. Saved menus also go by themselves, a few minutes after the last change."
	onclose={() => (putOpen = false)}
	onconfirm={() => void putOnWebsite()}
/>

<HelpDrawer {help} />

<style>
	/* The body inside the card, padded as the events editor's. The map keeps
	   its readable width (MenuItemsList's 64rem), left-aligned. */
	.tab-body {
		position: relative;
		padding: 1rem var(--card-pad-lg) var(--card-pad-lg);
	}

	.tab-body > :global(*) {
		max-width: 64rem;
	}

	.tab-body > :global(.form-section:first-child) {
		padding-top: 0;
		border-top: 0;
	}

	.menu-form {
		display: grid;
		gap: var(--space-4);
	}

	.menu-form > :global(.form-section) {
		padding-top: 0;
		border-top: 0;
	}

	.phone-status {
		display: none;
	}

	@media (max-width: 900px) {
		.phone-status {
			display: inline-flex;
		}

		.tab-body {
			padding: var(--space-4) max(var(--page-gutter), 1.125rem) max(var(--page-gutter), 1.125rem);
		}
	}
</style>
