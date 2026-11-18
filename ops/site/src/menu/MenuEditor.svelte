<script lang="ts">
	/**
	 * A menu's page (#305): its name, drinks or food, dates, days and pop-up
	 * kitchen, and under them its sections (chapters and their groups), which
	 * used to be Configuration › Menu sections. /menus/new starts a menu;
	 * /menus/new?popup=<id> starts it from a pop-up kitchen's name, nights and
	 * cooking days (Events → Add menu), for the owner to narrow down.
	 */
	import { onDestroy } from "svelte";
	import {
		Button,
		Card,
		ConfirmDialog,
		DateField,
		EditorBackBar,
		EmptyState,
		Field,
		FormSection,
		NativeSelect,
		PageHeader,
		Segmented,
		Skeleton,
		TextField,
		Badge,
	} from "../ui";
	import { Icon } from "../app/shell";
	import * as api from "../app/api";
	import { leaveEditor, menuPagePath, menusListPath, navigate, parseShellPath } from "../app/nav";
	import { setCrumbLeaf } from "../ui/crumbs.svelte";
	import { toast } from "../ui/toast.svelte";
	import { beginLeave, clearUnsavedGuard, setUnsavedGuard, takeBlockedNav } from "../ui/unsaved.svelte";
	import SectionsPanel from "./SectionsPanel.svelte";
	import MenuItemsList from "./MenuItemsList.svelte";
	import MenuDaysPicker from "./MenuDaysPicker.svelte";
	import { MENU_STATUS_TONES, blankMenu, menuDraft, menuPayload, popupDraft, sameMenu } from "./menu-form";
	import { menuDaysLabel } from "./menu-days.js";
	import { SECTION_KIND_ITEMS, type Menu, type MenuInput, type MenuItemChapter, type MenuPopupRun, type MenuSection } from "./types";

	let { path }: { path: string } = $props();

	const route = $derived(parseShellPath(path));
	const isNew = $derived(Boolean(route.isNew));
	const menuId = $derived(route.isNew ? "" : String(route.slug || ""));

	let menu = $state<Menu | null>(null);
	let sections = $state<MenuSection[]>([]);
	let items = $state<MenuItemChapter[]>([]);
	let menus = $state<Menu[]>([]);
	let popups = $state<MenuPopupRun[]>([]);
	let draft = $state<MenuInput>(blankMenu());
	/** What the form started from: the menu as saved, or a new one as first filled in. */
	let initial = $state<MenuInput>(blankMenu());
	let loading = $state(true);
	let error = $state("");
	let saving = $state(false);
	let deleting = $state(false);
	let copying = $state(false);
	let discardOpen = $state(false);
	let deleteOpen = $state(false);

	const dirty = $derived(!sameMenu(draft, initial));
	const canSave = $derived(!saving && Boolean(draft.name.trim()) && (isNew || dirty));
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
				items = [];
				const popup = popups.find((row) => row.id === popupFromAddress());
				draft = popup ? popupDraft(popup) : blankMenu();
				initial = { ...draft, days: [...draft.days] };
				setCrumbLeaf("");
				return;
			}
			const data = await api.getMenuPage(id);
			menu = data.menu;
			sections = data.sections || [];
			items = data.items || [];
			menus = data.menus || [];
			popups = data.popups || [];
			draft = menuDraft(data.menu);
			initial = menuDraft(data.menu);
			setCrumbLeaf(data.menu.name);
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't load this menu.";
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void load(menuId, isNew);
	});

	/** After a section changes: the sections again, and the menu's counts. */
	async function refreshSections() {
		if (!menuId) return;
		try {
			const data = await api.getMenuPage(menuId);
			sections = data.sections || [];
			items = data.items || [];
			menus = data.menus || [];
			menu = data.menu;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't reload the sections.");
		}
	}

	async function save(event?: Event) {
		event?.preventDefault();
		if (!canSave) return;
		saving = true;
		try {
			const body = menuPayload(draft);
			if (isNew) {
				const { menu: made } = await api.createMenu(body);
				initial = { ...draft, days: [...draft.days] };
				toast.ok(`${made.name} added. Now give it its sections.`);
				navigate(menuPagePath(made.id), { replace: true, force: true });
				return;
			}
			const { menu: saved } = await api.updateMenu(menuId, body);
			menu = saved;
			draft = menuDraft(saved);
			initial = menuDraft(saved);
			setCrumbLeaf(saved.name);
			toast.ok("Menu saved.");
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
			initial = draft;
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
		setUnsavedGuard(dirty && !saving, () => (discardOpen = true));
	});

	$effect(() => {
		if (!dirty || typeof window === "undefined") return;
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

	const title = $derived(isNew ? "New menu" : menu?.name || "Menu");
	const subtitle = $derived(
		isNew
			? "Name it, say when it runs, then save it and add its sections."
			: menu
				? `${menu.datesLabel} · ${menu.daysLabel} · ${menu.itemCount} item${menu.itemCount === 1 ? "" : "s"}`
				: "",
	);
</script>

<div class="page scrollbar-fade">
	<EditorBackBar label="Menus" {dirty} onback={back} />
	<PageHeader eyebrow="Menu" {title} {subtitle}>
		{#snippet actions()}
			<Button variant="outline" type="button" onclick={back}>
				{#snippet icon()}<Icon name="chevron-left" size={16} />{/snippet}
				Menus
			</Button>
			<Button
				variant="outline"
				type="button"
				busy={copying}
				disabled={Boolean(copyReason) || copying}
				reason={copyReason}
				onclick={() => void copy()}
			>
				{#snippet icon()}<Icon name="copy" size={16} />{/snippet}
				Copy menu
			</Button>
			<Button
				variant="ghost"
				type="button"
				disabled={Boolean(deleteReason) || deleting}
				reason={deleteReason}
				onclick={() => (deleteOpen = true)}
			>
				{#snippet icon()}<Icon name="trash" size={16} />{/snippet}
				Delete
			</Button>
			<Button
				variant="primary"
				type="button"
				busy={saving}
				disabled={!canSave}
				reason={!saving && !draft.name.trim() ? "Give it a name" : !saving && !isNew && !dirty ? "No changes to save" : undefined}
				onclick={() => void save()}
			>
				{#snippet icon()}<Icon name="save" size={16} />{/snippet}
				{isNew ? "Add menu" : "Save"}
			</Button>
		{/snippet}
	</PageHeader>

	{#if error}
		<EmptyState tone="error" title="Couldn't load this menu" text={error}>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => void load(menuId, isNew)}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
			{/snippet}
		</EmptyState>
	{:else if loading && !menu && !isNew}
		<Skeleton rows={5} lines={1} label="Loading the menu…" />
	{:else}
		{#if menu}
			<FormSection title="Items" description="Laid out as on the website. Click an item to change it.">
				<MenuItemsList chapters={items} menuName={menu.name} onchanged={refreshSections} />
			</FormSection>
		{/if}

		<Card>
			<form class="menu-form" novalidate onsubmit={save}>
				<FormSection title="The menu" description="What it's called, and when guests can order from it.">
					{#snippet actions()}
						{#if menu}<Badge tone={MENU_STATUS_TONES[menu.status]} label={menu.statusLabel} />{/if}
					{/snippet}
					<Field class="span-6" label="Name" for="menu-name" required hint="What guests see at the top, e.g. Brunch.">
						<TextField id="menu-name" size="sm" bind:value={draft.name} placeholder="Chez Pickle" autocomplete="off" />
					</Field>
					<Field class="span-6" label="Drinks or food" for="menu-kind" hint="Food goes on the kitchen page, drinks on the bar page.">
						<Segmented bind:value={draft.kind} items={SECTION_KIND_ITEMS} tone="soft" size="sm" ariaLabel="Drinks or food" />
					</Field>
					<Field class="span-3" label="Starts" for="menu-starts" optional hint="Empty: it's on already.">
						<DateField id="menu-starts" size="sm" bind:value={draft.startsOn} />
					</Field>
					<Field class="span-3" label="Ends" for="menu-ends" optional hint="Empty: it keeps going.">
						<DateField id="menu-ends" size="sm" bind:value={draft.endsOn} min={draft.startsOn} />
					</Field>
					<Field
						class="span-6"
						label="Days"
						for="menu-days"
						hint={draft.days.length ? `${menuDaysLabel(draft.days)}. Pick none for every day.` : "Every day. Pick days to narrow it down."}
					>
						<MenuDaysPicker id="menu-days" bind:days={draft.days} />
					</Field>
					<!-- Always there, so the form doesn't move when Drinks or Food is switched. -->
					<Field
						class="span-6"
						label="Pop-up kitchen"
						for="menu-popup"
						optional
						hint={draft.kind === "kitchen"
							? "Whose food this is. Pop-up kitchens are added in Events."
							: "Only a Food menu can belong to a pop-up kitchen."}
					>
						<NativeSelect
							id="menu-popup"
							size="sm"
							bind:value={draft.popupSeriesId}
							options={popupOptions}
							disabled={draft.kind !== "kitchen"}
						/>
					</Field>
				</FormSection>
				<button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
			</form>
		</Card>

		<FormSection
			title="Sections"
			description="Chapters and their groups, in the order guests see them. The print menu uses the same order."
		>
			{#if menu}
				<SectionsPanel {sections} menuId={menu.id} menus={menus.map(({ id, name }) => ({ id, name }))} busy={saving} onchanged={refreshSections} />
			{:else}
				<p class="muted">Add the menu first, then its sections go here.</p>
			{/if}
		</FormSection>
	{/if}
</div>

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

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
		display: grid;
		gap: var(--space-5);
		align-content: start;
	}

	.menu-form {
		display: grid;
		gap: var(--space-4);
	}

	.muted {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
</style>
