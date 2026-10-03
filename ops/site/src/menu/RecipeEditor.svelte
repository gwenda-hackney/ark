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
	} from "../ui";
	import type { SegmentedItem, SelectOption } from "../ui/types";
	import { formatGbp } from "../app/money";
	import { type InventoryItem } from "../inventory/types";
	import { COCKTAIL_TYPES, DRINK_TYPES, GLASSWARE, ICE_OPTIONS, defaultPosMenus, defaultServeQuantity, drinkTypeLabel, flattenIngredientsForMenu, hasRecipe, normalizeCocktailType, normalizeDrinkType, type CocktailType, type DrinkType, type Ingredient, type MenuItem, type MenuPlacement, type MenuSection, type PosMenu } from "./types";
	import { flattenMenuSections, sectionPathLabel } from "./menu-sections.js";
	import {
		computeRecipeAbv,
		computeRecipeVolumeMl,
		formatAbv,
		inventoryAbvById,
		parseAbvPercent,
	} from "./abv";
	import {
		analyzeRecipe,
		analysisPayload,
		parseAnalyzeNote,
		recipeSnapshot,
	} from "./analyze";
	import { parseStoredAnalyzeNote } from "./analyze-note.js";
	import {
		marginTone,
		recipePriceAnalysis,
	} from "./cost";
	import { pourSettings } from "../config/settings.svelte";
	import { namesClash } from "../app/spa-path.js";
	import * as api from "../app/api";
	import { menuTabPath, navigate, normalizeMenuTab } from "../app/nav";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../ui/unsaved.svelte";
	import {
		canUndoDraft,
		emptyDraftHistory,
		isDraftDirty,
		parseMenuDraft,
		recordDraftChange,
		serializeMenuDraft,
		undoDraft,
		type DraftHistory,
	} from "./draft-history";
	import { Icon } from "../app/shell";
	import IngredientPicker from "./IngredientPicker.svelte";
	import IngredientsGrid from "./IngredientsGrid.svelte";
	import MethodEditor from "./MethodEditor.svelte";
	import PourCostPanel from "./PourCostPanel.svelte";
	import RecipeAnalysisPanel from "./RecipeAnalysisPanel.svelte";
	import MenuPlacementsTable from "./MenuPlacementsTable.svelte";
	import {
		collectPosScreenSuggestions,
		defaultPosScreenForItem,
	} from "../inventory/lightspeed-stock.js";
	import { preparePhoto } from "../ui/photo-prep";

	let {
		item = $bindable(null as MenuItem | null),
		sections,
		inventory = $bindable([] as InventoryItem[]),
		menuItems = [] as MenuItem[],
		posMenus = [] as PosMenu[],
		busy = false,
		busyLabel = "Working…",
		cleanToken = 0,
		onsave,
		onprint,
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
		posMenus?: PosMenu[];
		busy?: boolean;
		busyLabel?: string;
		/** Bumped after a successful save so Close no longer prompts. */
		cleanToken?: number;
		tab?: string;
		tabBase?: string;
		onsave: () => unknown;
		onprint?: () => unknown;
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
	let addIngredientOpen = $state(false);
	let deleteOpen = $state(false);
	let discardOpen = $state(false);
	let discardKind = $state<"close" | "reload">("close");
	let history = $state<DraftHistory>(emptyDraftHistory());
	let restoring = false;
	let aiError = $state("");
	let aiBusy = $state(false);

	const screenSuggestions = $derived(
		collectPosScreenSuggestions(menuItems, (posMenus || []).map((menu) => menu.name)),
	);

	function easeOut(t: number): number {
		return 1 - Math.pow(1 - t, 3.2);
	}

	function onTabChange(id: string) {
		const order = ["details", "menu", "cost", "analysis"];
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
		const { posMenuIds, placements: draftPlacements, ingredients: _ings, ...rest } =
			draft as typeof draft & { placements?: string };
		const ids = new Set(String(posMenuIds || "").split(",").filter(Boolean));
		const nextPosMenus = (posMenus || []).filter((menu) =>
			ids.has(String(menu.id)),
		);
		let nextPlacements = item.placements || [];
		if (draftPlacements) {
			try {
				nextPlacements = JSON.parse(draftPlacements) as MenuPlacement[];
			} catch {
				/* keep */
			}
		}
		item = {
			...item,
			...rest,
			posMenus: nextPosMenus,
			placements: nextPlacements,
			ingredients: nextIngredients,
		};
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
			{ id: "details", label: "Build", href: hrefFor("details") },
			{ id: "menu", label: "Menu", href: hrefFor("menu") },
			{ id: "cost", label: "Cost", href: hrefFor("cost") },
			{ id: "analysis", label: "Analysis", href: hrefFor("analysis") },
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

	const itemKey = $derived(item?._id || (item ? "draft:new" : ""));

	$effect(() => {
		const key = itemKey;
		if (!item) {
			syncedKey = null;
			ingredients = [];
			history = emptyDraftHistory();
			aiError = "";
			aiBusy = false;
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

	async function acceptPhotoFile(file: File | undefined | null) {
		if (!file || !file.type.startsWith("image/")) return;
		await onphoto(await preparePhoto(file));
	}

	function removePhoto() {
		if (busy || !item?._id || !item.image?.asset?.url) return;
		void onphotoremove();
	}

	function onPhotoInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		void acceptPhotoFile(input.files?.[0]);
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
		void acceptPhotoFile(file);
	}

	function patch(field: keyof MenuItem, value: unknown) {
		if (!item) return;
		if (item[field] === value) return;
		remember(String(field));
		item = { ...item, [field]: value };
	}

	function setPlacements(next: MenuPlacement[]) {
		if (!item) return;
		remember("placements");
		const ensured = ensurePosPlacements(next);
		const print = ensured.find((row) => row.channel === "print");
		const digital = ensured.find((row) => row.channel === "digital");
		const pos = ensured.filter((row) => row.channel === "pos");
		item = {
			...item,
			placements: ensured,
			onPrintMenu: Boolean(print),
			onDigitalMenu: Boolean(digital),
			sectionId: print?.sectionId || digital?.sectionId || item.sectionId,
			posMenus: pos
				.map((row) => {
					const menu = (posMenus || []).find(
						(entry) => String(entry.id) === String(row.posMenuId),
					);
					return menu
						? { id: String(menu.id), name: menu.name }
						: row.posMenuId
							? { id: String(row.posMenuId), name: row.posMenuName || "" }
							: null;
				})
				.filter(Boolean) as PosMenu[],
			lightspeedMenuScreen: [
				...new Set(pos.map((row) => row.posScreen).filter(Boolean)),
			].join(","),
		};
	}

	function ensurePosPlacements(list: MenuPlacement[]): MenuPlacement[] {
		const hasGuest = list.some(
			(row) => row.channel === "print" || row.channel === "digital",
		);
		const hasPos = list.some((row) => row.channel === "pos");
		if (!hasGuest || hasPos) return list;
		const defaults = defaultPosMenus(posMenus);
		const screen =
			defaultPosScreenForItem(item) ||
			screenSuggestions[0] ||
			"Signature Cocktails";
		return [
			...list,
			...defaults.map((menu) => ({
				channel: "pos" as const,
				posMenuId: String(menu.id),
				posMenuName: menu.name,
				posScreen: screen,
			})),
		];
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
	const photoSrc = $derived.by(() => {
		if (!photoUrl) return "";
		try {
			const parsed = new URL(photoUrl, location.origin);
			if (parsed.hostname.includes("cdn.sanity.io")) {
				parsed.searchParams.set("w", "800");
				parsed.searchParams.set("fit", "max");
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
	const headerPourLabel = $derived.by(() => {
		const value = primaryServe?.pourCost;
		if (value == null || !Number.isFinite(value)) return "";
		const rounded = Math.round(value * 10) / 10;
		const text = Number.isInteger(rounded)
			? String(rounded)
			: rounded.toFixed(1);
		return `${text}% pour`;
	});
	const priceFieldLabel = $derived(primaryServe?.label || "Price");

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
		<div class="split">

			<div class="panel" class:dirty>
				<header class="panel-head">
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
							{#if item._id && item.name?.trim()}
								<Button
									variant="ghost"
									size="sm"
									type="button"
									disabled={busy}
									title="Print recipe"
									aria-label="Print recipe"
									onclick={() => void onprint?.()}
								>
									{#snippet icon()}
										<Icon name="print" size={15} />
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
						{#if headerPourLabel}
							<p
								class="pour-readout tnum"
								class:up={headerPourTone === "up"}
								class:down={headerPourTone === "down"}
								class:loss={headerPourTone === "loss"}
								class:muted={headerPourTone === "muted"}
								title="Pour cost from recipe cost and sell price"
							>
								{headerPourLabel}
							</p>
						{/if}
						{#if headerMeta}
							<p class="meta-line tnum">{headerMeta}</p>
						{/if}
					</div>
				</header>

				<div class="tabs">
					<Segmented
						value={tab}
						items={tabs}
						tone="soft"
						size="sm"
						ariaLabel="Drink sections"
					/>
				</div>

				<div class="tab-scroll scrollbar-fade">
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
						<section class="details-board">
							<div class="details-main">
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
									{:else}
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
									{/if}
									<div class="full">
										<Field
											label="Tasting note"
											for="f-notes"
											tooltip="Short line under the name."
										>
											<TextField
												id="f-notes"
												size="sm"
												value={item.notes || ""}
												placeholder="e.g. Floral fizz"
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
											tooltip="What guests read on the menu: the ingredient line or a longer blurb."
										>
											{#snippet actions()}
												{#if showRecipe}
													<Button
														variant="ghost"
														size="xs"
														type="button"
														aria-label="Fill in from ingredients"
														title="Fill in from ingredients"
														disabled={!flattenIngredientsForMenu(ingredients)}
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
												rows={3}
												value={item.description || ""}
												oninput={(e) =>
													patch(
														"description",
														(e.currentTarget as HTMLTextAreaElement).value,
													)}
											/>
										</Field>
									</div>
									<Field
										label="ABV"
										for="f-abv"
										tooltip={showRecipe
											? "Worked out from the ingredients. Type over it, or press the arrows to work it out again."
											: undefined}
									>
										{#snippet actions()}
											{#if showRecipe}
												<Button
													variant="ghost"
													size="xs"
													type="button"
													aria-label="Work out ABV and volume from ingredients"
													title="Work out ABV and volume from ingredients"
													disabled={!canRecalcRecipe}
													onclick={recalculateRecipeMetrics}
												>
													{#snippet icon()}
														<Icon name="refresh" />
													{/snippet}
												</Button>
											{/if}
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
										tooltip={showRecipe
											? "Worked out from the ingredients. Type over it if the glass holds a different amount."
											: undefined}
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
							</div>

							<aside
								class="details-side photo"
								class:dragging={photoDragging}
								aria-label="Photo"
								ondragenter={onPhotoDragEnter}
								ondragover={onPhotoDragOver}
								ondragleave={onPhotoDragLeave}
								ondrop={onPhotoDrop}
							>
								<div class="photo-head">
									<p class="photo-title">Photo</p>
									{#if item._id}
										<div class="photo-actions">
											<label class="photo-btn camera">
												<input
													class="sr-only"
													type="file"
													accept="image/*"
													capture="environment"
													disabled={busy}
													onchange={onPhotoInput}
												/>
												<Icon name="camera" size={15} />
												Take photo
											</label>
										{#if photoUrl}
											<label class="photo-btn">
												<input
													class="sr-only"
													type="file"
													accept="image/jpeg,image/png,image/webp,image/gif"
													disabled={busy}
													onchange={onPhotoInput}
												/>
												Replace
											</label>
											<button
												class="photo-btn remove"
												type="button"
												disabled={busy}
												onclick={removePhoto}
											>
												Remove
											</button>
										{/if}
										</div>
									{/if}
								</div>
								{#if !item._id}
									<p class="photo-empty muted">Save the drink first, then add a photo.</p>
								{:else if photoUrl}
									<div class="photo-frame">
										<img src={photoSrc} alt={item.image?.alt || item.name || ""} />
									</div>
								{:else}
									<label class="photo-empty">
										<input
											class="sr-only"
											type="file"
											accept="image/jpeg,image/png,image/webp,image/gif"
											disabled={busy}
											onchange={onPhotoInput}
										/>
										<Icon name="upload" size={18} />
										<span class="photo-empty-label">Add photo</span>
										<span class="photo-hint">or drop a picture here</span>
									</label>
								{/if}
								{#if photoDragging && item._id}
									<div class="photo-drop" aria-hidden="true">
										<span>Drop to {photoUrl ? "replace" : "add"}</span>
									</div>
								{/if}
							</aside>
						</section>

						<section class="block">
							<div class="section-head">
								<p class="section-title">{showRecipe ? "Ingredients" : "Serve"}</p>
								<Button
									variant="accent"
									size="sm"
									type="button"
									onclick={() => (addIngredientOpen = true)}
								>
									{#snippet icon()}
										<Icon name="plus" size={15} />
									{/snippet}
									{showRecipe ? "Add ingredient" : "Add stock"}
								</Button>
							</div>
							<IngredientsGrid
								ingredients={ingredients}
								bind:inventory
								onChange={onIngredientsChange}
							/>
						</section>

						{#if showRecipe}
							<section class="block">
								<p class="section-title">How to make it</p>
								<Field label="Method" for="f-method">
									<MethodEditor
										id="f-method"
										value={item.method || ""}
										onChange={(next) => patch("method", next)}
									/>
								</Field>
								<div class="grid three">
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
					{:else if tab === "menu"}
						<section class="block">
							<p class="section-title">Menus</p>
							<p class="lede-hint">Print, digital, and POS placements.</p>
							<div class="grid">
								<div class="full">
									<Field
										label="Till button name"
										for="f-pos-name"
										tooltip="Short name on the POS button. Leave blank to use the drink name. Serve sizes are added on export."
									>
										<TextField
											id="f-pos-name"
											size="sm"
											value={item.lightspeedName || ""}
											placeholder={item.name || "Same as drink name"}
											oninput={(e) =>
												patch(
													"lightspeedName",
													(e.currentTarget as HTMLInputElement).value,
												)}
										/>
									</Field>
								</div>
								<div class="full">
									<MenuPlacementsTable
										menus={posMenus}
										placements={item.placements || []}
										sectionOptions={sectionOptions}
										screenSuggestions={screenSuggestions}
										defaultSectionId={item.sectionId || ""}
										onchange={setPlacements}
									/>
								</div>
							</div>
						</section>
					{:else if tab === "cost"}
						<section class="block">
							{#if priceLive}
								<PourCostPanel
									price={priceLive}
									priceValue={item.price || ""}
									priceAltValue={item.priceAlt || ""}
									onpricealt={(value) => patch("priceAlt", value)}
								/>
							{:else}
								<p class="section-title">Pour cost</p>
								<p class="lede-hint">
									{showRecipe
										? "Add ingredients on Build to cost this drink."
										: "Link stock on Build to cost this drink."}
								</p>
							{/if}
						</section>
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
		overflow: hidden;
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		flex: 1;
		min-height: 0;
		height: 100%;
		padding: var(--space-4) var(--page-gutter) var(--space-4);
	}

	.type-line {
		grid-column: 1;
		grid-row: 1;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		align-self: center;
		height: var(--control-h-sm);
	}

	.eyebrow {
		min-width: 0;
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
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
		column-gap: var(--space-3);
		row-gap: 0.2rem;
		flex-shrink: 0;
		padding: 0.55rem var(--card-pad-lg) 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: var(--space-1);
		height: var(--control-h-sm);
	}

	.head-tools :global(.close-btn) {
		color: var(--muted-foreground);
	}

	.head-tools :global(.close-btn:hover:not(:disabled)) {
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
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
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

	.price-row {
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: var(--space-1);
		min-width: 0;
	}

	.price-edit,
	.pound,
	.price-input,
	.price-alt {
		font-family: var(--font);
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
		line-height: 1.3;
		color: var(--foreground);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
	}

	.price-edit {
		display: inline-flex;
		align-items: baseline;
		gap: 0;
		min-width: 0;
		padding: 0.08em var(--space-1) 0.18em var(--space-1);
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

	.price-edit:hover {
		border-color: var(--border);
	}

	.price-edit:focus-within {
		border-color: var(--ring);
		background: var(--sunken);
		box-shadow: 0 0 0 2px var(--ring-wash);
	}

	.price-input::-webkit-outer-spin-button,
	.price-input::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.pour-readout {
		margin: 0;
		font-family: var(--font);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.25;
		color: var(--foreground);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
	}

	.pour-readout.up {
		color: var(--up);
	}

	.pour-readout.down,
	.pour-readout.loss {
		color: var(--down);
	}

	.pour-readout.muted {
		color: var(--muted-foreground);
		font-weight: 500;
	}

	.meta-line {
		margin: 0;
		font-family: var(--font);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: 1.2;
		color: var(--muted-foreground);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
	}

	.sub {
		margin: 0;
		font-size: var(--text-base);
		color: var(--muted-foreground);
	}

	.panel-foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
		flex-shrink: 0;
		margin-top: auto;
		padding: 0.65rem var(--card-pad-lg) 0.85rem;
		border-top: 1px solid var(--border);
	}

	.panel-foot :global(.delete-btn) {
		margin-right: auto;
	}

	.delete-copy {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.45;
		color: var(--foreground);
	}

	.delete-copy strong {
		font-weight: 600;
	}

	.tabs {
		flex-shrink: 0;
		padding: 0.65rem var(--card-pad-lg) 0.35rem;
		background: var(--card);
		border-bottom: 1px solid var(--border);
	}

	.tab-scroll {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
	}

	.tab-body {
		position: relative;
		padding: 1rem var(--card-pad-lg) var(--card-pad-lg);
		container-type: inline-size;
		container-name: drink-detail;
	}

	.tab-panel {
		min-width: 0;
	}

	.block {
		display: grid;
		gap: var(--space-3);
	}

	.block + .block,
	.details-board + .block {
		margin-top: var(--space-6);
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: 0 0 var(--space-3);
		font-size: var(--text-md);
		font-weight: 600;
		line-height: 1.3;
		color: var(--foreground);
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
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.section-head .section-title {
		flex: 1 1 auto;
		margin: 0;
		min-width: 0;
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-3) var(--space-3);
		align-items: start;
	}

	.grid.three {
		grid-template-columns: minmax(0, 1fr);
	}

	.full {
		grid-column: 1 / -1;
	}

	/* Photo on top when narrow; beside the fields, top right, when wide. */
	.details-board {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5) var(--space-6);
		align-items: start;
	}

	.details-main {
		min-width: 0;
	}

	.details-side {
		order: -1;
		min-width: 0;
	}

	.photo {
		position: relative;
		display: grid;
		gap: var(--space-2);
	}

	.photo-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: var(--control-h-sm);
	}

	.photo-title {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.photo-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.photo-btn {
		display: inline-flex;
		align-items: center;
		height: var(--control-h-sm);
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: inherit;
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.photo-btn {
		gap: var(--space-2);
	}

	/* Phones and tablets only: opens the camera straight away. */
	.photo-btn.camera {
		display: none;
	}

	@media (pointer: coarse) {
		.photo-btn.camera {
			display: inline-flex;
		}
	}

	.photo-btn:focus-within,
	.photo-btn:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.photo-btn.remove:hover:not(:disabled),
	.photo-btn.remove:focus-visible {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.photo-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.photo-frame,
	.photo-empty {
		width: 100%;
		aspect-ratio: 16 / 10;
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.photo-frame {
		border: 1px solid var(--border);
		background: var(--bg);
	}

	.photo-frame img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.photo-empty {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--space-1);
		margin: 0;
		padding: var(--space-4);
		border: 1px dashed var(--border);
		background: var(--surface-2);
		color: var(--muted-foreground);
		text-align: center;
		cursor: pointer;
	}

	label.photo-empty:hover,
	label.photo-empty:focus-within {
		border-color: var(--border-strong, var(--border));
		color: var(--foreground);
	}

	.photo-empty.muted {
		font-size: var(--text-sm);
		cursor: default;
	}

	.photo-empty-label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--foreground);
	}

	.photo-hint {
		font-size: var(--text-xs);
	}

	.photo.dragging .photo-frame,
	.photo.dragging .photo-empty {
		border-color: var(--primary);
	}

	.photo-drop {
		position: absolute;
		inset: calc(var(--control-h-sm) + 0.6rem) 0 0;
		display: grid;
		place-content: center;
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--primary) 14%, transparent);
		color: var(--primary);
		font-weight: 600;
		pointer-events: none;
	}

	@container drink-detail (min-width: 34rem) {
		.grid.three {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@container drink-detail (min-width: 46rem) {
		.details-board {
			grid-template-columns: minmax(0, 1fr) minmax(14rem, 20rem);
		}

		.details-side {
			order: 0;
		}

		.photo-frame,
		.photo-empty {
			aspect-ratio: 1;
		}
	}

	.lede-hint {
		margin: -0.25rem 0 0.75rem;
		font-size: var(--text-sm);
		line-height: 1.45;
		color: var(--muted-foreground);
	}

	@media (max-width: 900px) {
		.split {
			padding: 0;
		}

		.panel {
			border-radius: 0;
			border-left: none;
			border-right: none;
		}

		.head-tools :global(.close-btn) {
			display: none;
		}

		.title-name,
		.panel-head:has(.title-meta) .title-name {
			grid-column: 1 / -1;
			grid-row: 2;
		}

		.title-meta {
			grid-column: 1 / -1;
			grid-row: 3;
			align-items: flex-start;
			padding-top: var(--space-1);
		}

		.price-row,
		.pour-readout {
			justify-content: flex-start;
			text-align: left;
		}

		.panel-head,
		.tabs,
		.tab-body,
		.panel-foot {
			padding-left: max(var(--page-gutter), 1.125rem);
			padding-right: max(var(--page-gutter), 1.125rem);
		}

		.tab-body {
			padding-top: var(--space-4);
			padding-bottom: max(var(--page-gutter), 1.125rem);
		}

		.panel-foot {
			padding-bottom: max(0.85rem, env(safe-area-inset-bottom, 0px));
		}
	}

	@media (max-width: 880px) {
		.head-tools {
			flex-wrap: wrap;
			height: auto;
			row-gap: var(--space-1);
		}

		.panel-foot {
			padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
		}
	}

	@media (max-width: 600px) {
		.title-input,
		.price-edit,
		.pound,
		.price-input,
		.price-alt {
			font-size: var(--text-xl);
			letter-spacing: var(--tracking-xl);
		}
	}
</style>
