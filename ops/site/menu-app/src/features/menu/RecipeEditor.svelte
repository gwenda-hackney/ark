<script lang="ts">
	import { onDestroy, untrack } from "svelte";
	import { fly } from "svelte/transition";
	import {
		Button,
		BusyOverlay,
		Dialog,
		EditorBackBar,
		Field,
		NativeSelect,
		Segmented,
		TextArea,
		TextField,
	} from "../../ui";
	import type { SegmentedItem, SelectOption } from "../../ui/types";
	import {
		COCKTAIL_TYPES,
		DRINK_TYPES,
		GLASSWARE,
		ICE_OPTIONS,
		defaultServeQuantity,
		drinkTypeLabel,
		flattenIngredientsForMenu,
		formatGbp,
		guestMenuBlurb,
		guestMenuFlags,
		guestMenuPlacement,
		asGuestMenuPlacement,
		GUEST_MENU_PLACEMENTS,
		hasRecipe,
		normalizeCocktailType,
		normalizeDrinkType,
		serveTabLabel,
		publishFieldLabel,
		publishHint,
		formatPublishDiff,
		type CocktailType,
		type DrinkType,
		type Ingredient,
		type InventoryItem,
		type MenuItem,
		type MenuSection,
	} from "../../lib/types";
	import { flattenMenuSections, sectionPathLabel } from "../../lib/menu-sections";
	import {
		computeRecipeAbv,
		computeRecipeVolumeMl,
		formatAbv,
		inventoryAbvById,
		parseAbvPercent,
	} from "../../lib/abv";
	import {
		analyzeRecipe,
		analysisPayload,
		parseAnalyzeNote,
		recipeSnapshot,
	} from "../../lib/analyze";
	import { parseStoredAnalyzeNote } from "../../../../functions/_lib/analyze-note.js";
	import {
		marginTone,
		recipePriceAnalysis,
		snapGbp,
	} from "../../lib/cost";
	import { pourSettings } from "../../lib/settings.svelte";
	import { namesClash } from "../../../../functions/_lib/spa-path.js";
	import * as api from "../../lib/api";
	import { menuTabPath, navigate, normalizeMenuTab } from "../../lib/nav";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../../lib/unsaved.svelte";
	import {
		canUndoDraft,
		emptyDraftHistory,
		isDraftDirty,
		parseMenuDraft,
		recordDraftChange,
		serializeMenuDraft,
		undoDraft,
		type DraftHistory,
	} from "../../lib/draft-history";
	import { Icon } from "../../shell";
	import IngredientPicker from "./IngredientPicker.svelte";
	import IngredientsGrid from "./IngredientsGrid.svelte";
	import PourCostPanel from "./PourCostPanel.svelte";
	import RecipeAnalysisPanel from "./RecipeAnalysisPanel.svelte";

	const PHOTO_KEY = "ops.menu.photo";

	function readPhotoOpen(): boolean {
		try {
			return localStorage.getItem(PHOTO_KEY) !== "closed";
		} catch {
			return true;
		}
	}

	let {
		item = $bindable(null as MenuItem | null),
		sections,
		inventory = $bindable([] as InventoryItem[]),
		menuItems = [] as MenuItem[],
		busy = false,
		busyLabel = "Working…",
		cleanToken = 0,
		onsave,
		ondelete,
		onphoto,
		onphotoremove,
		onback,
		onrefresh,
		ontab,
		tab: tabProp = "details",
		tabBase = "/menu/new",
	}: {
		item: MenuItem | null;
		sections: MenuSection[];
		inventory?: InventoryItem[];
		menuItems?: MenuItem[];
		busy?: boolean;
		busyLabel?: string;
		/** Bumped after a successful save so Close no longer prompts. */
		cleanToken?: number;
		tab?: string;
		tabBase?: string;
		onsave: () => void | Promise<void>;
		ondelete: () => void | Promise<void>;
		onphoto: (file: File) => void | Promise<void>;
		onphotoremove: () => void | Promise<void>;
		onback: (opts?: { force?: boolean }) => void;
		onrefresh: () => void | Promise<void>;
		ontab?: (id: string) => void;
	} = $props();

	let tabSlide = $state(1);
	let tabPrev = "details";
	let tabReady = false;
	let ingredients = $state<Ingredient[]>([]);
	let syncedKey = $state<string | null>(null);
	let snapshot = $state("");
	let photoDragging = $state(false);
	let photoDragDepth = 0;
	let photoOpen = $state(readPhotoOpen());
	let addIngredientOpen = $state(false);
	let deleteOpen = $state(false);
	let discardOpen = $state(false);
	let discardKind = $state<"close" | "reload">("close");
	let history = $state<DraftHistory>(emptyDraftHistory());
	let restoring = false;
	let aiError = $state("");
	let aiBusy = $state(false);
	let pourDraft = $state("");
	let pourFocused = $state(false);

	function easeOut(t: number): number {
		return 1 - Math.pow(1 - t, 3.2);
	}

	function onTabChange(id: string) {
		const order = ["details", "recipe", "analysis"];
		const from = order.indexOf(tabPrev);
		const to = order.indexOf(id);
		if (from >= 0 && to >= 0 && from !== to) {
			tabSlide = to > from ? 1 : -1;
		}
		tabPrev = id;
	}

	function serializeDraft(row: MenuItem | null): string {
		return serializeMenuDraft(row);
	}

	function remember(field: string) {
		if (restoring || busy || !item) return;
		history = recordDraftChange(history, field, serializeDraft(item));
	}

	function applySerialized(serialized: string) {
		if (!item) return;
		const draft = parseMenuDraft(serialized);
		restoring = true;
		const nextIngredients = (draft.ingredients || []).map((ing) => ({
			...ing,
		}));
		item = { ...item, ...draft, ingredients: nextIngredients };
		ingredients = nextIngredients;
		restoring = false;
	}

	function undo() {
		if (busy || !canUndo) return;
		const result = undoDraft(history);
		history = result.history;
		if (result.serialized) applySerialized(result.serialized);
	}

	function discardAndClose() {
		if (busy) return;
		if (dirty) {
			discardKind = "close";
			discardOpen = true;
			return;
		}
		onback({ force: true });
	}

	function requestReload() {
		if (busy || !item?._id) return;
		if (dirty) {
			discardKind = "reload";
			discardOpen = true;
			return;
		}
		void onrefresh();
	}

	function cancelDiscard() {
		discardOpen = false;
		takeBlockedNav();
	}

	function confirmDiscard() {
		if (busy) return;
		const kind = discardKind;
		discardOpen = false;
		if (kind === "reload") {
			void onrefresh();
			return;
		}
		beginLeave();
		const pending = takeBlockedNav();
		if (pending?.path) {
			navigate(pending.path, { force: true, replace: pending.replace });
			return;
		}
		onback({ force: true });
	}

	function requestDelete() {
		if (!item?._id || busy) return;
		deleteOpen = true;
	}

	function cancelDelete() {
		if (busy) return;
		deleteOpen = false;
	}

	function performDelete() {
		if (busy) return;
		void ondelete();
	}

	const drinkType = $derived(normalizeDrinkType(item?.drinkType));
	const showRecipe = $derived(hasRecipe(drinkType));
	const serveQty = $derived(defaultServeQuantity(drinkType)?.quantity);
	const requestedTab = $derived(normalizeMenuTab(tabProp));
	const tab = $derived(requestedTab);

	const tabs = $derived.by((): SegmentedItem[] => {
		const hrefFor = (id: string) => menuTabPath(tabBase, id);
		return [
			{ id: "details", label: "Details", href: hrefFor("details") },
			{
				id: "recipe",
				label: serveTabLabel(drinkType),
				href: hrefFor("recipe"),
			},
			{
				id: "analysis",
				label: "Analysis",
				href: hrefFor("analysis"),
			},
		];
	});

	const drinkTypeOptions: SelectOption[] = DRINK_TYPES.map((row) => ({
		value: row.value,
		label: row.label,
	}));

	const cocktailTypeOptions: SelectOption[] = [
		{ value: "", label: "—" },
		...COCKTAIL_TYPES.map((row) => ({
			value: row.value,
			label: row.label,
		})),
	];

	const sectionOptions: SelectOption[] = $derived(
		flattenMenuSections(sections).map((section) => ({
			value: section._id,
			label: sectionPathLabel(section),
		})),
	);

	const glassOptions: SelectOption[] = GLASSWARE.map((g) => ({
		value: g,
		label: g || "—",
	}));

	const iceOptions: SelectOption[] = ICE_OPTIONS.map((g) => ({
		value: g,
		label: g || "—",
	}));

	const guestPlacement = $derived(guestMenuPlacement(item));
	const guestPlacementItems: SegmentedItem[] = GUEST_MENU_PLACEMENTS.map((row) => ({
		id: row.value,
		label: row.label,
	}));

	const itemKey = $derived(item?._id || (item ? "draft:new" : ""));

	$effect(() => {
		const key = itemKey;
		if (!item) {
			syncedKey = null;
			ingredients = [];
			history = emptyDraftHistory();
			aiError = "";
			aiBusy = false;
			pourFocused = false;
			pourDraft = "";
			clearUnsavedGuard();
			return;
		}
		if (key === syncedKey) return;
		syncedKey = key;
		const rows = untrack(() => item?.ingredients);
		ingredients = (rows || []).map((ing) => ({ ...ing }));
		snapshot = serializeDraft(untrack(() => item));
		history = emptyDraftHistory();
		discardOpen = false;
		aiError = "";
		aiBusy = false;
		pourFocused = false;
		pourDraft = "";
	});

	$effect(() => {
		const token = cleanToken;
		if (!token) return;
		snapshot = serializeDraft(untrack(() => item));
		history = emptyDraftHistory();
	});

	$effect(() => {
		const id = tab;
		if (!tabReady) {
			tabPrev = id;
			tabReady = true;
			return;
		}
		onTabChange(id);
	});

	function onIngredientsChange(next: Ingredient[]) {
		const kind =
			next.length > ingredients.length
				? "ingredients:add"
				: next.length < ingredients.length
					? "ingredients:remove"
					: "ingredients";
		remember(kind);
		ingredients = next;
		if (!item) return;
		item = {
			...item,
			ingredients: next.map((ing) => ({ ...ing })),
			...recipeMetricsFrom(next),
		};
	}

	function recipeMetricsFrom(rows: Ingredient[]) {
		if (!hasRecipe(item?.drinkType)) return {};
		const byId = inventoryAbvById(inventory);
		const abv = computeRecipeAbv(rows, byId);
		const volumeMl = computeRecipeVolumeMl(rows);
		return {
			...(abv != null ? { abv: formatAbv(abv) } : {}),
			...(volumeMl != null ? { volume: `${volumeMl} ml` } : {}),
		};
	}

	function defaultServeLine(type: DrinkType, name: string | undefined): Ingredient | null {
		const qty = defaultServeQuantity(type);
		const label = String(name || "").trim();
		if (!qty || !label) return null;
		const match = inventory.find((stock) => namesClash(stock.name, label));
		return {
			name: match?.name || label,
			quantity: qty.quantity,
			unit: qty.unit,
			...(match?._id || match?.id
				? { inventoryId: String(match._id || match.id) }
				: {}),
		};
	}

	function recalculateRecipeMetrics() {
		if (!item) return;
		remember("metrics");
		item = { ...item, ...recipeMetricsFrom(ingredients) };
	}

	async function runAnalyze() {
		if (!item || !analysis || aiBusy || !canAnalyze) return;
		aiBusy = true;
		aiError = "";
		try {
			const data = await api.analyzeRecipeNote({
				item: recipeSnapshot(item, inventory),
				analysis: analysisPayload(analysis),
			});
			const parsed = parseAnalyzeNote(data.text);
			if (!parsed?.summary && !parsed?.concerns.length && !parsed?.questions.length) {
				aiError = "The model returned an empty note.";
				return;
			}
			remember("analysis");
			item = {
				...item,
				analysisNote: {
					...parsed,
					specKey: analysisKey,
				},
			};
		} catch (err) {
			aiError = err instanceof Error ? err.message : "Analysis failed.";
		} finally {
			aiBusy = false;
		}
	}

	function addIngredientLine(line: Ingredient) {
		onIngredientsChange([...ingredients, line]);
	}

	function createMenuLineFromIngredients() {
		if (!item) return;
		const line = flattenIngredientsForMenu(ingredients);
		if (!line) return;
		remember("description");
		item = { ...item, description: line };
	}

	function acceptPhotoFile(file: File | undefined | null) {
		if (!file || !file.type.startsWith("image/")) return;
		void onphoto(file);
	}

	function removePhoto() {
		if (busy || !item?._id || !item.image?.asset?.url) return;
		void onphotoremove();
	}

	function setPhotoOpen(next: boolean) {
		photoOpen = next;
		try {
			localStorage.setItem(PHOTO_KEY, next ? "open" : "closed");
		} catch {
			/* ignore quota / private mode */
		}
	}

	function onPhotoInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		acceptPhotoFile(input.files?.[0]);
		input.value = "";
	}

	function onPhotoDragEnter(e: DragEvent) {
		e.preventDefault();
		photoDragDepth += 1;
		if (e.dataTransfer?.types.includes("Files")) photoDragging = true;
	}

	function onPhotoDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
	}

	function onPhotoDragLeave(e: DragEvent) {
		e.preventDefault();
		photoDragDepth = Math.max(0, photoDragDepth - 1);
		if (photoDragDepth === 0) photoDragging = false;
	}

	function onPhotoDrop(e: DragEvent) {
		e.preventDefault();
		photoDragDepth = 0;
		photoDragging = false;
		const file = e.dataTransfer?.files?.[0];
		acceptPhotoFile(file);
	}

	function patch(field: keyof MenuItem, value: unknown) {
		if (!item) return;
		if (item[field] === value) return;
		remember(String(field));
		item = { ...item, [field]: value };
	}

	function setGuestPlacement(placement: string) {
		if (!item) return;
		const next = guestMenuFlags(asGuestMenuPlacement(placement));
		if (
			(item.onPrintMenu !== false) === next.onPrintMenu &&
			(item.onDigitalMenu !== false) === next.onDigitalMenu
		) {
			return;
		}
		remember("guestPlacement");
		item = { ...item, ...next };
	}

	function pourText(value: number | null | undefined): string {
		if (value == null || !Number.isFinite(value)) return "";
		const rounded = Math.round(value * 10) / 10;
		return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
	}

	function priceFieldText(value: number): string {
		return Number.isInteger(value) ? String(value) : value.toFixed(1);
	}

	function commitHeaderPour() {
		pourFocused = false;
		const cost = primaryServe?.drinkCost;
		const n = Number(String(pourDraft).replace(/%/g, "").trim());
		if (
			cost == null ||
			cost <= 0 ||
			!Number.isFinite(n) ||
			n <= 0 ||
			n >= 100
		) {
			pourDraft = pourText(primaryServe?.pourCost);
			return;
		}
		patch("price", priceFieldText(snapGbp(cost / (n / 100))));
	}

	function setDrinkType(next: DrinkType) {
		if (!item) return;
		if (normalizeDrinkType(item.drinkType) === next) return;
		remember("drinkType");
		const cleared =
			next === "packaged"
				? { ...item, drinkType: next, priceAlt: "", cocktailType: "" as const }
				: next === "cocktail"
					? { ...item, drinkType: next }
					: { ...item, drinkType: next, cocktailType: "" as const };
		if (next === "cocktail") {
			item = cleared;
			return;
		}
		const serve = defaultServeLine(next, item.name);
		const nextIngredients = serve ? [serve] : [];
		item = { ...cleared, method: "", ingredients: nextIngredients };
		ingredients = nextIngredients;
	}

	const photoUrl = $derived(item?.image?.asset?.url);
	const heroPhotoSrc = $derived.by(() => {
		if (!photoUrl) return "";
		try {
			const parsed = new URL(photoUrl, location.origin);
			if (parsed.hostname.includes("cdn.sanity.io")) {
				parsed.searchParams.set("w", "1200");
				parsed.searchParams.set("fit", "max");
				parsed.searchParams.set("auto", "format");
				return parsed.toString();
			}
		} catch {
			/* keep original */
		}
		return photoUrl;
	});
	const thumbPhotoSrc = $derived.by(() => {
		if (!photoUrl) return "";
		try {
			const parsed = new URL(photoUrl, location.origin);
			if (parsed.hostname.includes("cdn.sanity.io")) {
				parsed.searchParams.set("w", "240");
				parsed.searchParams.set("h", "240");
				parsed.searchParams.set("fit", "crop");
				parsed.searchParams.set("auto", "format");
				return parsed.toString();
			}
		} catch {
			/* keep original */
		}
		return photoUrl;
	});
	const abvLabel = $derived.by(() => {
		const parsed = parseAbvPercent(item?.abv);
		return parsed == null ? "" : formatAbv(parsed);
	});
	const typeLine = $derived(drinkTypeLabel(drinkType));
	const canRecalcRecipe = $derived(
		computeRecipeAbv(ingredients, inventoryAbvById(inventory)) != null,
	);
	const analysis = $derived(
		item
			? analyzeRecipe(item, inventory, menuItems, pourSettings.targets)
			: null,
	);
	const priceLive = $derived(
		item
			? recipePriceAnalysis(item, inventory, pourSettings.targets)
			: null,
	);
	const primaryServe = $derived(priceLive?.serves[0] ?? null);
	const headerPourTone = $derived(
		marginTone(
			primaryServe?.margin,
			primaryServe?.pourCost,
			priceLive?.targetPourCost,
		),
	);
	const headerCost = $derived.by(() => {
		if (priceLive?.drinkCost == null) return "";
		const amount = formatGbp(priceLive.drinkCost);
		return priceLive.hasEstimates ? `~${amount}` : amount;
	});
	const headerMeta = $derived(
		[headerCost, abvLabel ? `${abvLabel} ABV` : ""]
			.filter(Boolean)
			.join(" · "),
	);
	const canSetPour = $derived(
		primaryServe?.drinkCost != null && primaryServe.drinkCost > 0,
	);
	const priceFieldLabel = $derived(primaryServe?.label || "Price");

	$effect(() => {
		if (pourFocused) return;
		pourDraft = pourText(primaryServe?.pourCost);
	});
	const canAnalyze = $derived(
		Boolean(
			analysis &&
				(analysis.volumeMl != null || analysis.price.drinkCost != null),
		),
	);
	const analysisKey = $derived(
		item
			? JSON.stringify({
					ingredients: item.ingredients,
					method: item.method,
					ice: item.ice,
					glassware: item.glassware,
					description: item.description,
					volume: item.volume,
					price: item.price,
					priceAlt: item.priceAlt,
					drinkType: item.drinkType,
					targets: pourSettings.targets,
				})
			: "",
	);
	const aiNote = $derived(
		item ? parseStoredAnalyzeNote(item.analysisNote) : null,
	);
	const analyzedKey = $derived(aiNote?.specKey || "");
	const aiStale = $derived(
		Boolean(aiNote && analyzedKey && analyzedKey !== analysisKey),
	);
	const currentDraft = $derived(serializeDraft(item));
	const dirty = $derived(isDraftDirty(snapshot, currentDraft));
	const canUndo = $derived(canUndoDraft(history, currentDraft));
	const undoHint =
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPad/.test(navigator.platform || "")
			? "⌘Z"
			: "Ctrl+Z";

	$effect(() => {
		if (!dirty || typeof window === "undefined") return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	});

	$effect(() => {
		setUnsavedGuard(dirty, () => {
			discardKind = "close";
			discardOpen = true;
		});
	});

	onDestroy(() => clearUnsavedGuard());

	$effect(() => {
		if (typeof window === "undefined") return;
		function onKey(e: KeyboardEvent) {
			if (busy) return;
			if (e.key === "Escape") {
				if (deleteOpen || addIngredientOpen || discardOpen) return;
				e.preventDefault();
				discardAndClose();
				return;
			}
			if (
				(e.metaKey || e.ctrlKey) &&
				e.key.toLowerCase() === "z" &&
				!e.shiftKey
			) {
				if (deleteOpen || addIngredientOpen || discardOpen) return;
				if (!canUndo) return;
				e.preventDefault();
				undo();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});
</script>

{#if item}
	<form
		class="editor"
		aria-busy={busy || undefined}
		onsubmit={(e) => {
			e.preventDefault();
			if (busy) return;
			onsave();
		}}
	>
		<BusyOverlay active={busy} label={busyLabel} />
		<EditorBackBar label="Menu" {dirty} onback={discardAndClose} />
		<div class="split" class:photo-collapsed={!photoOpen}>
			<aside
				class="hero"
				class:dragging={photoDragging}
				aria-hidden={!photoOpen}
				inert={!photoOpen}
				ondragenter={onPhotoDragEnter}
				ondragover={onPhotoDragOver}
				ondragleave={onPhotoDragLeave}
				ondrop={onPhotoDrop}
			>
				<button
					class="photo-collapse"
					type="button"
					title="Hide photo"
					aria-label="Hide photo"
					tabindex={photoOpen ? 0 : -1}
					onclick={() => setPhotoOpen(false)}
				>
					<Icon name="chevron-left" size={16} />
				</button>
				{#if photoUrl}
					<img
						class="hero-img"
						src={heroPhotoSrc}
						alt={item.image?.alt || item.name || ""}
					/>
					<div class="photo-hit has-photo">
						<label class="photo-btn">
							<Icon name="upload" size={16} />
							Replace photo
							<input
								class="sr-only"
								type="file"
								accept="image/jpeg,image/png,image/webp,image/gif"
								onchange={onPhotoInput}
							/>
						</label>
						<button
							class="photo-btn remove"
							type="button"
							disabled={busy}
							onclick={removePhoto}
						>
							<Icon name="trash" size={16} />
							Remove photo
						</button>
					</div>
				{:else}
					<label class="photo-hit empty">
						<span class="photo-btn primary">
							<Icon name="upload" size={16} />
							Add photo
						</span>
						<span class="photo-hint">or drop an image here</span>
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							onchange={onPhotoInput}
						/>
					</label>
				{/if}
				{#if photoDragging}
					<div class="photo-drop" aria-hidden="true">
						<span>Drop to {photoUrl ? "replace" : "add"}</span>
					</div>
				{/if}
			</aside>

			<div class="panel" class:dirty>
				<header class="panel-head">
					<div class="thumb">
						<label class="thumb-hit" aria-label={photoUrl ? "Replace photo" : "Add photo"}>
							{#if photoUrl}
								<img
									class="thumb-img"
									src={thumbPhotoSrc}
									alt=""
								/>
							{:else}
								<span class="thumb-empty">
									<Icon name="upload" size={16} />
								</span>
							{/if}
							<input
								class="sr-only"
								type="file"
								accept="image/jpeg,image/png,image/webp,image/gif"
								onchange={onPhotoInput}
							/>
						</label>
						{#if photoUrl}
							<button
								class="thumb-remove"
								type="button"
								disabled={busy}
								aria-label="Remove photo"
								onclick={removePhoto}
							>
								<Icon name="close" size={12} />
							</button>
						{/if}
					</div>
					<div class="type-line">
						<p class="eyebrow">{typeLine}</p>
						{#if dirty}
							<span
								class="dirty-dot"
								title="Unsaved"
								aria-live="polite"
							>
								<span class="sr-only">Unsaved</span>
							</span>
						{/if}
					</div>
					<div class="head-tools">
						<div class="toolbar-actions">
							{#if !photoOpen}
								<Button
									class="photo-expand"
									variant="ghost"
									size="sm"
									type="button"
									title="Show photo"
									aria-label="Show photo"
									onclick={() => setPhotoOpen(true)}
								>
									{#snippet icon()}
										<Icon name="chevron-right" />
									{/snippet}
								</Button>
							{/if}
							<Button
								variant="ghost"
								size="sm"
								type="button"
								disabled={busy || !canUndo}
								title={`Undo ${undoHint}`}
								aria-label={`Undo last edit (${undoHint})`}
								onclick={undo}
							>
								{#snippet icon()}
									<Icon name="undo" />
								{/snippet}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								type="button"
								disabled={busy || !item._id}
								title="Reload"
								aria-label="Reload from server"
								onclick={requestReload}
							>
								{#snippet icon()}
									<Icon name="refresh" />
								{/snippet}
							</Button>
							<Button
								class="close-btn"
								variant="ghost"
								size="sm"
								type="button"
								aria-label={dirty ? "Close with unsaved changes" : "Close"}
								title={dirty ? "Close (unsaved)" : "Close"}
								onclick={discardAndClose}
							>
								{#snippet icon()}
									<Icon name="close" size={16} />
								{/snippet}
							</Button>
						</div>
					</div>
					<div class="title-name">
						<input
							class="title-input"
							id="f-name"
							required
							autocomplete="off"
							aria-label="Drink name"
							value={item.name || ""}
							oninput={(e) =>
								patch(
									"name",
									(e.currentTarget as HTMLInputElement).value,
								)}
						/>
						{#if item.notes}
							<p class="sub">{item.notes}</p>
						{/if}
					</div>
					<div class="title-meta">
						<div class="price-row">
							<label class="sr-only" for="f-price">{priceFieldLabel} price</label>
							<div class="price-edit">
								<span class="pound" aria-hidden="true">£</span>
								<input
									class="price-input"
									id="f-price"
									inputmode="decimal"
									autocomplete="off"
									placeholder="0"
									value={item.price || ""}
									oninput={(e) =>
										patch(
											"price",
											(e.currentTarget as HTMLInputElement).value,
										)}
								/>
							</div>
							{#if item.priceAlt}
								<span class="price-alt tnum">/ {item.priceAlt}</span>
							{/if}
						</div>
						<label class="pour-row">
							<span class="sr-only">{priceFieldLabel} pour cost</span>
							<input
								class="pour-input tnum"
								id="f-pour"
								class:up={headerPourTone === "up"}
								class:down={headerPourTone === "down"}
								class:loss={headerPourTone === "loss"}
								class:muted={headerPourTone === "muted" ||
									primaryServe?.pourCost == null}
								inputmode="decimal"
								autocomplete="off"
								disabled={!canSetPour}
								placeholder={canSetPour ? "" : "n/a"}
								title={canSetPour
									? `Pour cost. Type a percent to set the ${priceFieldLabel.toLowerCase()} price.`
									: "Need a drink cost before pour can be set."}
								value={pourDraft}
								onfocus={() => (pourFocused = true)}
								oninput={(e) =>
									(pourDraft = (
										e.currentTarget as HTMLInputElement
									).value)}
								onblur={commitHeaderPour}
								onkeydown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										commitHeaderPour();
										(e.currentTarget as HTMLInputElement).blur();
									}
									if (e.key === "Escape") {
										e.preventDefault();
										pourFocused = false;
										pourDraft = pourText(primaryServe?.pourCost);
										(e.currentTarget as HTMLInputElement).blur();
									}
								}}
							/>
							{#if canSetPour || pourDraft}
								<span class="pour-suffix" aria-hidden="true">%</span>
							{/if}
						</label>
						{#if headerMeta}
							<p class="meta-line tnum">{headerMeta}</p>
						{/if}
					</div>
				</header>

				<div class="tab-scroll scrollbar-fade">
					<div class="tabs">
						<Segmented
							value={tab}
							items={tabs}
							tone="soft"
							size="sm"
							ariaLabel="Drink sections"
						/>
					</div>

					<div class="tab-body">
					{#key tab}
						<div
							class="tab-panel"
							in:fly={{
								x: tabSlide * 14,
								duration: 260,
								opacity: 0,
								easing: easeOut,
							}}
						>
					{#if tab === "details"}
						<section class="block">
							<div class="grid">
								<Field label="Drink type" for="f-drink-type">
									<NativeSelect
										id="f-drink-type"
										size="sm"
										options={drinkTypeOptions}
										value={drinkType}
										onchange={(e) =>
											setDrinkType(
												(e.currentTarget as HTMLSelectElement)
													.value as DrinkType,
											)}
									/>
								</Field>
								{#if showRecipe}
									<Field
										label="Category"
										for="f-cocktail-type"
										tooltip="Build family: spritz, highball, stirred, and so on. Separate from where it sits on the menu."
									>
										<NativeSelect
											id="f-cocktail-type"
											size="sm"
											options={cocktailTypeOptions}
											value={normalizeCocktailType(item.cocktailType)}
											onchange={(e) =>
												patch(
													"cocktailType",
													normalizeCocktailType(
														(e.currentTarget as HTMLSelectElement).value,
													) as CocktailType | "",
												)}
										/>
									</Field>
								{/if}
								<Field label="Section" for="f-section">
									<NativeSelect
										id="f-section"
										size="sm"
										options={sectionOptions}
										value={item.sectionId ||
											item.section?._ref ||
											item.section?._id ||
											""}
										onchange={(e) =>
											patch(
												"sectionId",
												(e.currentTarget as HTMLSelectElement).value,
											)}
									/>
								</Field>
							</div>
						</section>

						{#if !showRecipe}
							<section class="block">
								<div class="grid">
									<Field label="Producer" for="f-producer-d">
										<TextField
											id="f-producer-d"
											size="sm"
											value={item.producer || ""}
											oninput={(e) =>
												patch(
													"producer",
													(e.currentTarget as HTMLInputElement).value,
												)}
										/>
									</Field>
									<Field label="ABV" for="f-abv-d">
										<TextField
											id="f-abv-d"
											size="sm"
											value={item.abv || ""}
											oninput={(e) =>
												patch(
													"abv",
													(e.currentTarget as HTMLInputElement).value,
												)}
										/>
									</Field>
									<div class="full">
										<Field label="Volume" for="f-volume-d">
											<TextField
												id="f-volume-d"
												size="sm"
												value={item.volume || ""}
												oninput={(e) =>
													patch(
														"volume",
														(e.currentTarget as HTMLInputElement)
															.value,
													)}
											/>
										</Field>
									</div>
								</div>
							</section>
						{/if}

						<section class="block">
							<p class="section-title">Menu</p>
							<div class="grid">
								<div class="full">
									<Field
										label="Guest menus"
										for="f-guest-menu"
										tooltip="POS can still sell this drink if it is off print and the website."
									>
										<Segmented
											value={guestPlacement}
											items={guestPlacementItems}
											size="sm"
											ariaLabel="Guest menus"
											onChange={setGuestPlacement}
										/>
									</Field>
									<p class="hint">{guestMenuBlurb(guestPlacement)}</p>
									{#if item.onDigitalMenu !== false}
										<p class="hint">{publishHint(item.publish)}</p>
										{#if item.publish?.staging?.diff?.length || item.publish?.production?.diff?.length}
											<ul class="publish-diff">
												{#each item.publish?.staging?.diff || [] as change (`staging-${change.field}`)}
													<li>
														Preview · {publishFieldLabel(change.field)}:
														{formatPublishDiff(change)}
													</li>
												{/each}
												{#each item.publish?.production?.diff || [] as change (`live-${change.field}`)}
													<li>
														Live · {publishFieldLabel(change.field)}:
														{formatPublishDiff(change)}
													</li>
												{/each}
											</ul>
										{/if}
									{/if}
								</div>
								<div class="full">
									<Field
										label="Tasting note"
										for="f-notes"
										tooltip="Short line under the name on the website menu."
									>
										<TextField
											id="f-notes"
											size="sm"
											value={item.notes || ""}
											oninput={(e) =>
												patch(
													"notes",
													(e.currentTarget as HTMLInputElement).value,
												)}
										/>
									</Field>
								</div>
								<div class="full">
									<Field
										label="Menu description"
										for="f-description"
										tooltip="Longer description guests see on the website menu."
									>
										{#snippet actions()}
										{#if showRecipe}
											<Button
												variant="ghost"
												size="xs"
												type="button"
												aria-label="Create from ingredients"
												title="Create from ingredients"
												disabled={!flattenIngredientsForMenu(
													ingredients,
												)}
												onclick={createMenuLineFromIngredients}
											>
												{#snippet icon()}
													<Icon name="from-list" size={14} />
												{/snippet}
											</Button>
										{/if}
									{/snippet}
										<TextArea
											id="f-description"
											rows={4}
											value={item.description || ""}
											oninput={(e) =>
												patch(
													"description",
													(e.currentTarget as HTMLTextAreaElement)
														.value,
												)}
										/>
									</Field>
								</div>
							</div>
						</section>
					{:else if tab === "recipe"}
						{#if showRecipe}
						<section class="block">
							<div class="grid">
								<Field
									label="ABV"
									for="f-abv"
									tooltip="From inventory for linked ingredients. Recalculate after stock ABV changes."
								>
									{#snippet actions()}
										<Button
											variant="ghost"
											size="xs"
											type="button"
											aria-label="Recalculate from recipe"
											title="Recalculate ABV and volume from recipe"
											disabled={!canRecalcRecipe}
											onclick={recalculateRecipeMetrics}
										>
											{#snippet icon()}
												<Icon name="refresh" />
											{/snippet}
										</Button>
									{/snippet}
									<TextField
										id="f-abv"
										size="sm"
										value={item.abv || ""}
										oninput={(e) =>
											patch(
												"abv",
												(e.currentTarget as HTMLInputElement).value,
											)}
									/>
								</Field>
								<Field
									label="Volume"
									for="f-volume"
									tooltip="From recipe volumes. Recalculate with ABV after stock changes."
								>
									<TextField
										id="f-volume"
										size="sm"
										value={item.volume || ""}
										oninput={(e) =>
											patch(
												"volume",
												(e.currentTarget as HTMLInputElement).value,
											)}
									/>
								</Field>
							</div>
						</section>
						{/if}
						<section class="block">
							<div class="section-head">
								<p class="section-title">{showRecipe ? "Ingredients" : "Serve"}</p>
								<Button
									variant="accent"
									size="xs"
									type="button"
									aria-label={showRecipe ? "Add ingredient" : "Add stock"}
									title={showRecipe ? "Add ingredient" : "Add stock"}
									onclick={() => (addIngredientOpen = true)}
								>
									{#snippet icon()}
										<Icon name="plus" size={15} />
									{/snippet}
								</Button>
							</div>
							<IngredientsGrid
								ingredients={ingredients}
								bind:inventory
								onChange={onIngredientsChange}
							/>
							{#if priceLive}
								<PourCostPanel
									price={priceLive}
									priceValue={item.price || ""}
									priceAltValue={item.priceAlt || ""}
									onprice={(value) => patch("price", value)}
									onpricealt={(value) => patch("priceAlt", value)}
								/>
							{/if}
						</section>
						{#if showRecipe}
						<section class="block">
							<Field label="Method" for="f-method">
								<TextArea
									id="f-method"
									rows={4}
									value={item.method || ""}
									oninput={(e) =>
										patch(
											"method",
											(e.currentTarget as HTMLTextAreaElement).value,
										)}
								/>
							</Field>
						</section>
						{/if}
						{#if showRecipe}
						<section class="block">
							<p class="section-title">Serving</p>
							<div class="grid">
								<Field label="Glassware" for="f-glass">
									<NativeSelect
										id="f-glass"
										size="sm"
										options={glassOptions}
										value={item.glassware || ""}
										onchange={(e) =>
											patch(
												"glassware",
												(e.currentTarget as HTMLSelectElement).value,
											)}
									/>
								</Field>
								<Field label="Ice" for="f-ice">
									<NativeSelect
										id="f-ice"
										size="sm"
										options={iceOptions}
										value={item.ice || ""}
										onchange={(e) =>
											patch(
												"ice",
												(e.currentTarget as HTMLSelectElement).value,
											)}
									/>
								</Field>
								<div class="full">
									<Field label="Garnish" for="f-garnish">
										<TextField
											id="f-garnish"
											size="sm"
											value={item.garnish || ""}
											oninput={(e) =>
												patch(
													"garnish",
													(e.currentTarget as HTMLInputElement).value,
												)}
										/>
									</Field>
								</div>
							</div>
						</section>
						{/if}

						<Dialog
							open={addIngredientOpen}
							title={showRecipe ? "Add ingredient" : "Add stock"}
							onclose={() => (addIngredientOpen = false)}
						>
							<IngredientPicker
								bind:inventory
								active={addIngredientOpen}
								defaultQuantity={serveQty != null ? String(serveQty) : ""}
								onpick={addIngredientLine}
							/>
							{#snippet footer()}
								<Button
									variant="outline"
									size="sm"
									type="button"
									onclick={() => (addIngredientOpen = false)}
								>
									Done
								</Button>
							{/snippet}
						</Dialog>
					{:else if tab === "analysis"}
						<RecipeAnalysisPanel
							{analysis}
							note={aiNote}
							stale={aiStale}
							busy={aiBusy}
							error={aiError}
							disabled={busy}
							canAnalyze={canAnalyze}
							onanalyze={runAnalyze}
						/>
					{/if}
						</div>
					{/key}
				</div>
				</div>

				<footer class="panel-foot">
					{#if item._id}
						<Button
							class="delete-btn"
							variant="destructive"
							size="sm"
							type="button"
							disabled={busy}
							busy={busy && busyLabel.startsWith("Deleting")}
							onclick={requestDelete}
						>
							{#snippet icon()}
								<Icon name="x-circle" />
							{/snippet}
							Delete
						</Button>
					{/if}
					<Button
						variant="primary"
						size="sm"
						type="submit"
						disabled={busy}
						busy={busy && busyLabel.startsWith("Saving")}
					>
						{#snippet icon()}
							<Icon name="save" />
						{/snippet}
						{busy && busyLabel.startsWith("Saving") ? "Saving…" : "Save"}
					</Button>
				</footer>
			</div>
		</div>

		<Dialog
			open={discardOpen}
			title="Discard unsaved changes?"
			onclose={cancelDiscard}
		>
			<p class="delete-copy">
				{discardKind === "reload"
					? "Reload will discard unsaved changes."
					: "You have edits that have not been saved. Close without saving?"}
			</p>
			{#snippet footer()}
				<Button
					variant="outline"
					size="sm"
					type="button"
					onclick={cancelDiscard}
				>
					Keep editing
				</Button>
				<Button
					variant="destructive"
					size="sm"
					type="button"
					onclick={confirmDiscard}
				>
					Discard
				</Button>
			{/snippet}
		</Dialog>

		<Dialog
			open={deleteOpen}
			title="Delete drink?"
			onclose={cancelDelete}
		>
			<p class="delete-copy">
				Delete <strong>{item.name?.trim() || "this drink"}</strong> from the
				menu? This cannot be undone.
			</p>
			{#snippet footer()}
				<Button
					variant="outline"
					size="sm"
					type="button"
					disabled={busy}
					onclick={cancelDelete}
				>
					Cancel
				</Button>
				<Button
					variant="destructive"
					size="sm"
					type="button"
					disabled={busy}
					busy={busy && busyLabel.startsWith("Deleting")}
					onclick={performDelete}
				>
					{busy && busyLabel.startsWith("Deleting") ? "Deleting…" : "Delete"}
				</Button>
			{/snippet}
		</Dialog>
	</form>
{/if}

<style>
	.editor {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 40%) minmax(0, 1fr);
		column-gap: var(--gap);
		row-gap: var(--gap);
		flex: 1;
		min-height: 0;
		height: 100%;
		padding: var(--gap) var(--page-gutter) var(--gap);
		transition:
			grid-template-columns var(--t-slow) var(--ease),
			column-gap var(--t-slow) var(--ease);
	}

	.hero {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--sunken);
		overflow: hidden;
		box-shadow: var(--shadow-sm);
		opacity: 1;
		transition:
			opacity var(--t) var(--ease),
			border-color var(--t-slow) var(--ease),
			box-shadow var(--t-slow) var(--ease);
	}

	.photo-collapse {
		position: absolute;
		top: 0.55rem;
		right: 0.55rem;
		z-index: 3;
		display: grid;
		place-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--card) 88%, transparent);
		color: var(--muted-foreground);
		backdrop-filter: blur(8px);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity var(--t-fast) var(--ease-in-out),
			color var(--t-fast) var(--ease-in-out),
			background-color var(--t-fast) var(--ease-in-out),
			border-color var(--t-fast) var(--ease-in-out);
	}

	.hero:hover .photo-collapse,
	.hero:focus-within .photo-collapse,
	.photo-collapse:focus-visible {
		opacity: 1;
	}

	.photo-collapse:hover,
	.photo-collapse:focus-visible {
		color: var(--foreground);
		border-color: var(--border-strong, var(--border));
		background: var(--card);
	}

	.split.photo-collapsed {
		grid-template-columns: 0% minmax(0, 1fr);
		column-gap: 0;
	}

	.split.photo-collapsed .hero {
		opacity: 0;
		border-color: transparent;
		box-shadow: none;
		pointer-events: none;
	}

	.hero.dragging {
		border-color: var(--primary);
		box-shadow: var(--shadow-primary);
	}

	.hero-img {
		flex: 1;
		min-height: 0;
		width: 100%;
		object-fit: cover;
		object-position: center;
		display: block;
		background: #0a0a0a;
		pointer-events: none;
	}

	.photo-hit {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 0.55rem;
		margin: 0;
		cursor: pointer;
	}

	.photo-hit.empty {
		background:
			radial-gradient(
				ellipse at 50% 30%,
				var(--primary-wash-strong),
				transparent 55%
			),
			var(--sunken);
	}

	.photo-hit.has-photo {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: transparent;
		opacity: 0;
		transition: opacity var(--t-fast) var(--ease-in-out);
	}

	.photo-hit.has-photo .photo-btn {
		pointer-events: none;
	}

	.photo-hit.has-photo:hover,
	.photo-hit.has-photo:focus-within,
	.hero.dragging .photo-hit.has-photo {
		opacity: 1;
		background: color-mix(in srgb, #0d0d0d 45%, transparent);
	}

	.photo-hit.has-photo:hover .photo-btn,
	.photo-hit.has-photo:focus-within .photo-btn,
	.hero.dragging .photo-hit.has-photo .photo-btn {
		pointer-events: auto;
	}

	.photo-hit.empty input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.photo-btn {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		height: var(--control-h-sm);
		padding: 0 0.95rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--card) 88%, transparent);
		color: var(--foreground);
		font-family: inherit;
		font-size: var(--text);
		font-weight: 500;
		line-height: 1;
		appearance: none;
		backdrop-filter: blur(8px);
		cursor: pointer;
	}

	.photo-hit.empty .photo-btn {
		pointer-events: none;
	}

	.photo-btn.primary {
		background: var(--primary);
		border-color: var(--primary);
		color: var(--primary-foreground);
	}

	.photo-btn.remove {
		color: var(--destructive);
		border-color: color-mix(in srgb, var(--destructive) 45%, var(--border-strong));
	}

	.photo-hit.has-photo:hover .photo-btn:not(.primary):not(.remove),
	.photo-hit.has-photo:focus-within .photo-btn:not(.primary):not(.remove) {
		background: var(--card);
	}

	.photo-btn.remove:hover:not(:disabled),
	.photo-btn.remove:focus-visible {
		background: var(--destructive-wash);
		border-color: var(--destructive);
	}

	.photo-btn.remove:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.photo-hint {
		position: relative;
		z-index: 1;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
		pointer-events: none;
	}

	.photo-drop {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: grid;
		place-content: center;
		pointer-events: none;
		background: color-mix(in srgb, var(--primary) 14%, transparent);
		color: var(--primary);
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.type-line {
		grid-column: 1;
		grid-row: 1;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		align-self: center;
		height: var(--control-h-sm);
	}

	.eyebrow {
		min-width: 0;
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dirty-dot {
		display: inline-flex;
		flex-shrink: 0;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--destructive);
		box-shadow: 0 0 0 3px var(--destructive-wash);
	}

	.head-tools {
		grid-column: 2;
		grid-row: 1;
		display: flex;
		align-items: center;
		justify-self: end;
		height: var(--control-h-sm);
	}

	.panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--card);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
		transition: border-color var(--t-fast) var(--ease-in-out);
	}

	.panel.dirty {
		border-color: color-mix(in srgb, var(--destructive) 32%, var(--border));
	}

	.panel-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		column-gap: 0.85rem;
		row-gap: 0.2rem;
		padding: 0.45rem var(--card-pad) 0.65rem;
		border-bottom: 1px solid var(--border);
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: 0.25rem;
		height: var(--control-h-sm);
	}

	.head-tools :global(.close-btn) {
		color: var(--muted-foreground);
	}

	.head-tools :global(.close-btn:hover:not(:disabled)) {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.thumb {
		display: none;
	}

	.split.photo-collapsed .thumb {
		display: block;
		position: relative;
		grid-column: 1;
		grid-row: 1 / span 2;
		width: 3.75rem;
		height: 3.75rem;
		align-self: start;
		margin-top: 0.15rem;
	}

	.split.photo-collapsed .panel-head {
		grid-template-columns: 3.75rem minmax(0, 1fr) auto;
		column-gap: 0.7rem;
	}

	.split.photo-collapsed .type-line {
		grid-column: 2;
		grid-row: 1;
	}

	.split.photo-collapsed .head-tools {
		grid-column: 3;
		grid-row: 1;
	}

	.split.photo-collapsed .title-name,
	.split.photo-collapsed .panel-head:has(.title-meta) .title-name {
		grid-column: 2 / -1;
		grid-row: 2;
	}

	.split.photo-collapsed .title-meta {
		grid-column: 1 / -1;
		grid-row: 3;
		align-items: flex-start;
		padding-top: 0.35rem;
	}

	.split.photo-collapsed .price-row,
	.split.photo-collapsed .pour-row {
		justify-content: flex-start;
	}

	.thumb-hit {
		display: block;
		width: 100%;
		height: 100%;
		margin: 0;
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--sunken);
		cursor: pointer;
	}

	.thumb-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.thumb-empty {
		display: grid;
		place-content: center;
		width: 100%;
		height: 100%;
		color: var(--muted-foreground);
	}

	.thumb-hit:focus-within {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.thumb-remove {
		position: absolute;
		top: -0.35rem;
		right: -0.35rem;
		display: grid;
		place-content: center;
		width: 1.35rem;
		height: 1.35rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--card);
		color: var(--muted-foreground);
		cursor: pointer;
	}

	.thumb-remove:hover:not(:disabled),
	.thumb-remove:focus-visible {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.title-name {
		grid-column: 1 / -1;
		grid-row: 2;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.15rem;
		min-width: 0;
	}

	.panel-head:has(.title-meta) .title-name {
		grid-column: 1;
	}

	.title-input {
		display: block;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		padding: 0.08em 0.35rem 0.22em;
		margin: 0 -0.35rem;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		font-family: var(--font-display);
		font-size: clamp(1.45rem, 2.2vw, 1.85rem);
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.3;
		outline: none;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			background-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.title-input::placeholder {
		color: var(--subtle-foreground);
	}

	.title-input:hover {
		border-color: var(--border);
	}

	.title-input:focus {
		border-color: var(--ring);
		background: var(--sunken);
		box-shadow: 0 0 0 2px var(--ring-wash);
	}

	.title-meta {
		grid-column: 2;
		grid-row: 2;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-self: stretch;
		gap: 0.08rem;
		padding-top: 0.12rem;
	}

	.price-row,
	.pour-row {
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: 0.35rem;
		min-width: 0;
	}

	.pour-row {
		cursor: text;
	}

	.price-edit,
	.pound,
	.price-input,
	.price-alt {
		font-family: var(--font);
		font-size: clamp(1.45rem, 2.2vw, 1.85rem);
		font-weight: 600;
		letter-spacing: 0.02em;
		line-height: 1.3;
		color: var(--primary);
		font-variant-numeric: tabular-nums;
	}

	.price-edit {
		display: inline-flex;
		align-items: baseline;
		gap: 0;
		min-width: 0;
		padding: 0.08em 0.28rem 0.18em 0.35rem;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			background-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.pound {
		flex: none;
		padding: 0;
		margin: 0;
		line-height: inherit;
	}

	.price-input {
		width: auto;
		min-width: 1.2ch;
		max-width: 7ch;
		box-sizing: content-box;
		padding: 0;
		margin: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		text-align: left;
		field-sizing: content;
		outline: none;
	}

	.price-alt {
		color: color-mix(in srgb, var(--primary) 62%, var(--muted-foreground));
		white-space: nowrap;
	}

	.price-edit:hover,
	.pour-input:hover:not(:disabled) {
		border-color: var(--border);
	}

	.price-edit:focus-within,
	.pour-input:focus {
		border-color: var(--ring);
		background: var(--sunken);
		box-shadow: 0 0 0 2px var(--ring-wash);
	}

	.pour-input {
		width: 4.6ch;
		min-width: 3.2ch;
		max-width: 6.5ch;
		box-sizing: content-box;
		padding: 0.04em 0.2rem 0.1em;
		margin: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		font-family: var(--font);
		font-size: clamp(1.15rem, 1.8vw, 1.4rem);
		font-weight: 600;
		letter-spacing: 0.02em;
		line-height: 1.2;
		text-align: right;
		outline: none;
		font-variant-numeric: tabular-nums;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			background-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.price-input::-webkit-outer-spin-button,
	.price-input::-webkit-inner-spin-button,
	.pour-input::-webkit-outer-spin-button,
	.pour-input::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.pour-input.up {
		color: var(--up);
	}

	.pour-input.down,
	.pour-input.loss {
		color: var(--down);
	}

	.pour-input.muted,
	.pour-input:disabled {
		color: var(--muted-foreground);
		font-weight: 500;
	}

	.pour-suffix {
		font-size: clamp(1.15rem, 1.8vw, 1.4rem);
		font-weight: 600;
		color: inherit;
	}

	.pour-row:has(.pour-input.up) .pour-suffix {
		color: var(--up);
	}

	.pour-row:has(.pour-input.down) .pour-suffix,
	.pour-row:has(.pour-input.loss) .pour-suffix {
		color: var(--down);
	}

	.pour-row:has(.pour-input.muted) .pour-suffix,
	.pour-row:has(.pour-input:disabled) .pour-suffix {
		color: var(--muted-foreground);
	}

	.meta-line {
		margin: 0;
		font-family: var(--font);
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.04em;
		line-height: 1.2;
		color: var(--muted-foreground);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.sub {
		margin: 0;
		font-size: var(--text);
		color: var(--muted-foreground);
	}

	.panel-foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: auto;
		padding: 0.55rem var(--card-pad) 0.75rem;
		border-top: 1px solid var(--border);
	}

	.panel-foot :global(.delete-btn) {
		margin-right: auto;
	}

	.delete-copy {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--foreground);
	}

	.delete-copy strong {
		font-weight: 600;
	}

	.tabs {
		position: sticky;
		top: 0;
		z-index: 2;
		padding: 0.55rem var(--card-pad) 0;
		background: var(--card);
		border-bottom: 1px solid var(--border);
	}

	.tab-scroll {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	.tab-body {
		position: relative;
		padding: 0.35rem var(--card-pad) var(--card-pad);
	}

	.tab-panel {
		min-height: 100%;
	}

	.block {
		display: grid;
		gap: 0.85rem;
	}

	.block + .block {
		margin-top: 1.25rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0 0 0.65rem;
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.3;
		color: var(--primary);
	}

	.section-title::after {
		content: "";
		flex: 1 1 auto;
		height: 1px;
		min-width: 1.5rem;
		background: var(--border-strong);
	}

	.section-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.65rem;
	}

	.section-head .section-title {
		flex: 1 1 auto;
		margin: 0;
		min-width: 0;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem 0.85rem;
		align-items: start;
	}

	.grid.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.full {
		grid-column: 1 / -1;
	}

	.hint {
		margin: 0.15rem 0 0;
		font-size: var(--text);
		line-height: 1.4;
		color: var(--muted-foreground);
	}

	.publish-diff {
		margin: 0.35rem 0 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.15rem;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--muted-foreground);
	}

	@media (max-width: 1100px) {
		.split {
			grid-template-columns: minmax(0, 36%) minmax(0, 1fr);
		}

		.split.photo-collapsed {
			grid-template-columns: 0% minmax(0, 1fr);
		}

		.grid.three {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (max-width: 900px) {
		.split,
		.split.photo-collapsed {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr);
			height: auto;
			padding: 0;
			column-gap: 0;
			row-gap: 0;
			transition: none;
		}

		.hero {
			display: none;
		}

		.panel {
			border-radius: 0;
			border-left: none;
			border-right: none;
		}

		.head-tools :global(.close-btn) {
			display: none;
		}

		.head-tools :global(.photo-expand) {
			display: none;
		}

		.thumb {
			display: block;
			position: relative;
			grid-column: 1;
			grid-row: 1 / span 2;
			width: 3.75rem;
			height: 3.75rem;
			align-self: start;
			margin-top: 0.15rem;
		}

		.panel-head {
			grid-template-columns: 3.75rem minmax(0, 1fr) auto;
			column-gap: 0.7rem;
		}

		.type-line {
			grid-column: 2;
			grid-row: 1;
		}

		.head-tools {
			grid-column: 3;
			grid-row: 1;
		}

		.title-name,
		.panel-head:has(.title-meta) .title-name {
			grid-column: 2 / -1;
			grid-row: 2;
		}

		.title-meta {
			grid-column: 1 / -1;
			grid-row: 3;
			align-items: flex-start;
			padding-top: 0.35rem;
		}

		.price-row,
		.pour-row {
			justify-content: flex-start;
		}
	}

	@media (max-width: 880px) {
		.split {
			grid-template-columns: 1fr;
			height: auto;
			padding: 0;
			gap: 0;
		}

		.head-tools {
			flex-wrap: wrap;
			height: auto;
			row-gap: 0.35rem;
		}

		.panel-foot {
			padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
		}

		.grid,
		.grid.three {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 600px) {
		.title-input,
		.price-edit,
		.pound,
		.price-input,
		.price-alt {
			font-size: 1.35rem;
		}
	}
</style>
