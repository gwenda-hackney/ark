<script lang="ts">
	import { onDestroy, untrack } from "svelte";
	import { fly } from "svelte/transition";
	import {
		Button,
		BusyOverlay,
		ConfirmDialog,
		Dialog,
		EditorActionBar,
		EditorBackBar,
		Field,
		FormHeading,
		FormLead,
		FormSection,
		MoneyField,
		NativeSelect,
		NumberField,
		OverflowMenu,
		PageHelp,
		Segmented,
		TextArea,
		TextField,
	} from "../ui";
	import { FormErrors } from "../ui/form-errors.svelte";
	import { ITEM_FIELD_ORDER, itemFieldTab, stripUnit, validateItem } from "./item-validate";
	import { addPlacement, defaultPosScreen, placementChoices } from "./placement-add";
	import type { SegmentedItem, SelectOption } from "../ui/types";
	import { formatGbp } from "../app/money";
	import { type InventoryItem } from "../inventory/types";
	import { COCKTAIL_TYPES, DRINK_TYPES, GLASSWARE, ICE_OPTIONS, defaultPosMenus, defaultServeQuantity, drinkTypeLabel, flattenIngredientsForMenu, hasRecipe, normalizeCocktailType, normalizeDrinkType, type CocktailType, type DrinkType, type Ingredient, type MenuItem, type MenuPlacement, type MenuSection, type PosMenu } from "./types";
	import { flattenMenuSections, sectionPathLabel } from "./menu-sections.js";
	import { newPriceRow, normalizePrices, priceLabels, relabelPrices, withPrices, type PriceRow } from "./prices.js";
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
		formatPourPercent,
		marginTone,
		recipePriceAnalysis,
		suggestedAltPrice,
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
	import { menuEditorActions } from "./editor-actions";
	import { ITEM_HELP, ITEM_TIPS } from "./item-help";
	import IngredientPicker from "./IngredientPicker.svelte";
	import IngredientsGrid from "./IngredientsGrid.svelte";
	import MethodEditor from "./MethodEditor.svelte";
	import { PhotoActions } from "../ui";
	import PriceTable from "./PriceTable.svelte";
	import PriceGauges from "./PriceGauges.svelte";
	import PourSettingsDialog from "./PourSettingsDialog.svelte";
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
	let pourSettingsOpen = $state(false);
	/** Problems from the last Save, by field id; kept fresh as they are fixed. */
	const errors = new FormErrors();

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
			{ id: "cost", label: "Pricing", href: hrefFor("cost") },
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
		errors.clearAll();
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

	/** Add placement: every kind, every time, each adding a row with sensible defaults. */
	const placementItems = $derived(
		placementChoices(posMenus || []).map((choice) => {
			const noChapter = (choice.value === "print" || choice.value === "digital") && !sectionOptions.length;
			return {
				label: choice.label,
				disabled: noChapter,
				reason: noChapter ? "Add a chapter in Sections first" : undefined,
				onselect: () => {
					const current = item?.placements || [];
					setPlacements(
						addPlacement(current, choice.value, posMenus || [], {
							sectionId: String(item?.sectionId || sectionOptions[0]?.value || "").trim(),
							screen: defaultPosScreen(current, screenSuggestions),
							sectionIds: sectionOptions.map((option) => String(option.value)),
							screens: screenSuggestions,
						}),
					);
				},
			};
		}),
	);

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
			// One entry per POS menu, though a menu can carry several screens.
			posMenus: [...new Map(pos.map((row) => [String(row.posMenuId), row])).values()]
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
		// Rows still named for the old type (Single, Double) take the new type's names.
		const priced = withPrices(item, relabelPrices(normalizePrices(item), item.drinkType, next));
		const cleared =
			next === "cocktail"
				? { ...priced, drinkType: next }
				: { ...priced, drinkType: next, cocktailType: "" as const };
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

	/** The price table (Pricing tab); Build shows it on one line. */
	const priceRows = $derived(item ? normalizePrices(item) : []);
	/** Build edits the first two prices; the rest live on Pricing. */
	const buildPriceLabels = $derived(priceLabels(drinkType));
	const showSecondPrice = $derived(priceRows.length > 1 || Boolean(buildPriceLabels.alt));
	const secondSuggested = $derived(
		priceLive?.priceRows?.[1]?.serve?.suggestedPrice ?? suggestedAltPrice(priceLive),
	);
	const morePrices = $derived(Math.max(0, priceRows.length - 2));

	function setBuildPrice(index: 0 | 1, value: string) {
		const next = value.trim();
		if (index === 1 && !priceRows[1]) {
			if (!next) return;
			setPrices([...priceRows, { ...newPriceRow(priceRows, drinkType), price: next }], "prices:price:1");
			return;
		}
		const row = priceRows[index];
		if (!row || (row.price || "") === next) return;
		// Clearing a second price nobody has named or given a SKU takes the row away.
		if (index === 1 && !next && priceRows.length === 2 && !row.sku) {
			setPrices([priceRows[0]], "prices:price:1");
			return;
		}
		setPrices(priceRows.map((r, i) => (i === index ? { ...r, price: next } : r)), `prices:price:${index}`);
	}
	const hasRecipeCost = $derived(
		Boolean(priceLive && (priceLive.drinkCost != null || priceLive.lines.length > 0)),
	);

	function setPrices(next: PriceRow[], field: string) {
		if (!item) return;
		remember(field);
		item = withPrices(item, next);
	}

	function addPrice() {
		setPrices([...priceRows, newPriceRow(priceRows, drinkType)], "prices:add");
	}

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
					prices: normalizePrices(item),
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
	const savedDraft = $derived(snapshot ? parseMenuDraft(snapshot) : null);

	function validate() {
		return item ? validateItem(item, menuItems, item._id ? savedDraft : null) : {};
	}

	function showErrors() {
		return errors.reveal({
			order: ITEM_FIELD_ORDER,
			tabOf: itemFieldTab,
			currentTab: tab,
			showTab: (id) => navigate(menuTabPath(tabBase, id)),
		});
	}

	function submit() {
		if (busy || !item) return;
		errors.replace(validate());
		if (errors.count) {
			void showErrors();
			return;
		}
		onsave();
	}

	// After a Save found problems, keep them in step with what's typed.
	$effect(() => {
		if (!errors.count) return;
		errors.replace(validate());
	});

	/** The figure beside its unit: "12.5%" shows as 12.5 next to %. */
	function patchWithUnit(field: "abv" | "volume", raw: string) {
		const text = raw.trim();
		patch(field, text ? (field === "abv" ? `${text}%` : `${text} ml`) : "");
	}


	const currentDraft = $derived(serializeDraft(item));
	const dirty = $derived(isDraftDirty(snapshot, currentDraft));
	const canUndo = $derived(canUndoDraft(history, currentDraft));
	const avail = $derived(
		menuEditorActions({
			saved: Boolean(item?._id),
			named: Boolean(item?.name?.trim()),
			canUndo,
			cocktail: showRecipe,
			hasIngredientLine: Boolean(flattenIngredientsForMenu(ingredients)),
			canRecalc: canRecalcRecipe,
			hasPhoto: Boolean(photoUrl),
			busy,
		}),
	);
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

{#snippet editPrices()}
	<a class="edit-prices" href={menuTabPath(tabBase, "cost")}>
		{morePrices ? `${morePrices} more on Pricing` : "Edit prices"}
	</a>
{/snippet}

{#if item}
	<form
		class="editor"
		novalidate
		aria-busy={busy || undefined}
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<BusyOverlay active={busy} label={busyLabel} />
		<EditorBackBar label="Menu" onback={discardAndClose} />
		<div class="split">

			<div class="panel" class:dirty>
				<header class="panel-head">
					<div class="type-line">
						<p class="eyebrow">{typeLine}</p>
					</div>
					<div class="head-tools">
						<div class="toolbar-actions">
							<Button
									variant="ghost"
									size="sm"
									type="button"
									disabled={avail.print.disabled}
									reason={avail.print.reason}
									title="Print recipe"
									aria-label="Print recipe"
									onclick={() => void onprint?.()}
								>
									{#snippet icon()}
										<Icon name="print" size={14} />
									{/snippet}
								</Button>
							<Button
								variant="ghost"
								size="sm"
								type="button"
								disabled={avail.undo.disabled}
								reason={avail.undo.reason}
								title={`Undo ${undoHint}`}
								aria-label={`Undo last edit (${undoHint})`}
								onclick={undo}
							>
								{#snippet icon()}
									<Icon name="undo" />
								{/snippet}
							</Button>
							<PageHelp title="Menu item" topics={ITEM_HELP} />
							<Button
								variant="ghost"
								size="sm"
								type="button"
								disabled={avail.reload.disabled}
								reason={avail.reload.reason}
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
						<h1 class="title-text" class:placeholder={!item.name?.trim()}>
							{item.name?.trim() || "New drink"}
						</h1>
						{#if item.notes}
							<p class="sub">{item.notes}</p>
						{/if}
					</div>
					<div class="title-meta">
						<span class="price-label">
							{priceFieldLabel === "Price" ? "Price" : `Price · ${priceFieldLabel}`}
						</span>
						<p class="price-readout tnum" class:muted={!item.price}>
							{item.price ? `£${item.price}` : "No price"}
							{#if item.priceAlt}
								<span class="price-alt">/ £{item.priceAlt}</span>
							{/if}
						</p>
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
						<div class="board">
							<FormLead asideWidth="24rem" fill>
								{#snippet aside()}
									<FormHeading title="Photo">
										{#snippet actions()}
										<PhotoActions
											take={avail.takePhoto}
											replace={avail.replacePhoto}
											remove={avail.removePhoto}
											onfile={onPhotoInput}
											onremove={removePhoto}
										/>
										{/snippet}
									</FormHeading>
									<div
										class="photo"
										class:dragging={photoDragging}
										role="group"
										aria-label="Photo"
										ondragenter={onPhotoDragEnter}
										ondragover={onPhotoDragOver}
										ondragleave={onPhotoDragLeave}
										ondrop={onPhotoDrop}
									>
										{#if !item?._id}
											<p class="photo-empty muted">No photo yet</p>
										{:else if photoUrl}
											<div class="photo-frame">
												<img src={photoSrc} alt={item?.image?.alt || item?.name || ""} />
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
										{#if photoDragging && item?._id}
											<div class="photo-drop" aria-hidden="true">
												<span>Drop to {photoUrl ? "replace" : "add"}</span>
											</div>
										{/if}
									</div>
								{/snippet}

								<Field class="lead-first span-6" label="Name" for="f-name" required error={errors.get("f-name")}>
									<TextField
										id="f-name"
										size="sm"
										autocomplete="off"
										placeholder="Negroni"
										value={item.name || ""}
										oninput={(e) => patch("name", (e.currentTarget as HTMLInputElement).value)}
									/>
								</Field>
								<Field
									class="span-6"
									label="Tasting note"
									for="f-notes"
									required={showRecipe}
									error={errors.get("f-notes")}
									tooltip={ITEM_TIPS.tastingNote}
								>
									<TextField
										id="f-notes"
										size="sm"
										value={item.notes || ""}
										placeholder="Floral fizz"
										oninput={(e) => patch("notes", (e.currentTarget as HTMLInputElement).value)}
									/>
								</Field>
								<Field class="span-3" label="Drink type" for="f-drink-type" required>
									<NativeSelect
										id="f-drink-type"
										size="sm"
										options={drinkTypeOptions}
										value={drinkType}
										onchange={(e) =>
											setDrinkType((e.currentTarget as HTMLSelectElement).value as DrinkType)}
									/>
								</Field>
								{#if showRecipe}
									<Field
										class="span-3"
										label="Category"
										for="f-cocktail-type"
										optional
										tooltip={ITEM_TIPS.category}
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
									<Field class="span-3" label="Producer" for="f-producer-d" optional>
										<TextField
											id="f-producer-d"
											size="sm"
											value={item.producer || ""}
											oninput={(e) => patch("producer", (e.currentTarget as HTMLInputElement).value)}
										/>
									</Field>
								{/if}
								<Field
									class={showSecondPrice ? "span-3" : "span-6"}
									label={priceRows[0]?.name?.trim() || buildPriceLabels.primary}
									for="f-price-0"
									required
									error={errors.get("f-price-0")}
									actions={showSecondPrice ? undefined : editPrices}
								>
									<MoneyField
										id="f-price-0"
										size="sm"
										value={priceRows[0]?.price || ""}
										oninput={(e) => setBuildPrice(0, (e.currentTarget as HTMLInputElement).value)}
										oncommit={(next) => setBuildPrice(0, next)}
									/>
								</Field>
								{#if showSecondPrice}
									<Field
										class="span-3"
										label={priceRows[1]?.name?.trim() || buildPriceLabels.alt || "Second price"}
										for="f-price-1"
										optional
										error={errors.get("f-price-1")}
										actions={editPrices}
									>
										<MoneyField
											id="f-price-1"
											size="sm"
											value={priceRows[1]?.price || ""}
											placeholder={secondSuggested != null ? `${secondSuggested} meets the pour target` : ""}
											oninput={(e) => setBuildPrice(1, (e.currentTarget as HTMLInputElement).value)}
											oncommit={(next) => setBuildPrice(1, next)}
										/>
									</Field>
								{/if}
								<Field
									label="Menu description"
									for="f-description"
									required
									error={errors.get("f-description")}
									tooltip={ITEM_TIPS.description}
								>
									{#snippet actions()}
										<Button
											variant="ghost"
											size="xs"
											type="button"
											disabled={avail.fromRecipe.disabled}
											reason={avail.fromRecipe.reason}
											onclick={createMenuLineFromIngredients}
										>
											{#snippet icon()}
												<Icon name="from-list" size={14} />
											{/snippet}
											From recipe
										</Button>
									{/snippet}
									<TextArea
										id="f-description"
										rows={3}
										value={item.description || ""}
										oninput={(e) => patch("description", (e.currentTarget as HTMLTextAreaElement).value)}
									/>
								</Field>
							</FormLead>

							<FormSection
								title={showRecipe ? "Recipe" : "Serve"}
								class="sec-recipe"
								tooltip={showRecipe ? ITEM_TIPS.recipe : ITEM_TIPS.serve}
							>
								{#snippet actions()}
									<Button variant="outline" size="sm" type="button" onclick={() => (addIngredientOpen = true)}>
										{#snippet icon()}
											<Icon name="plus" size={15} />
										{/snippet}
										{showRecipe ? "Add ingredient" : "Add stock"}
									</Button>
								{/snippet}
								<IngredientsGrid {ingredients} bind:inventory onChange={onIngredientsChange} />
							</FormSection>

							{#if showRecipe}
								<FormSection title="Method" class="sec-method" tooltip={ITEM_TIPS.method}>
									<Field class="span-8" label="How to make it" for="f-method">
										<MethodEditor
											id="f-method"
											value={item.method || ""}
											onChange={(next) => patch("method", next)}
										/>
									</Field>
									<div class="span-side form-stack">
										<Field label="Glassware" for="f-glass">
											<NativeSelect
												id="f-glass"
												size="sm"
												options={glassOptions}
												value={item.glassware || ""}
												onchange={(e) => patch("glassware", (e.currentTarget as HTMLSelectElement).value)}
											/>
										</Field>
										<Field label="Ice" for="f-ice">
											<NativeSelect
												id="f-ice"
												size="sm"
												options={iceOptions}
												value={item.ice || ""}
												onchange={(e) => patch("ice", (e.currentTarget as HTMLSelectElement).value)}
											/>
										</Field>
										<Field label="Garnish" for="f-garnish" optional>
											<TextField
												id="f-garnish"
												size="sm"
												value={item.garnish || ""}
												oninput={(e) => patch("garnish", (e.currentTarget as HTMLInputElement).value)}
											/>
										</Field>
									</div>
								</FormSection>
							{/if}

						</div>

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
									{#snippet icon()}<Icon name="check" size={14} />{/snippet}
									Done
								</Button>
							{/snippet}
						</Dialog>
					{:else if tab === "menu"}
						<div class="board-tab">
							<FormSection
								title="On the menu"
								class="sec-copy"
							>
								<Field
									class="span-2"
									label="ABV"
									for="f-abv"
									optional
									error={errors.get("f-abv")}
									tooltip={showRecipe ? ITEM_TIPS.abv : undefined}
								>
									{#snippet actions()}
										<Button
											variant="ghost"
											size="xs"
											type="button"
											aria-label="Work out ABV and volume from the recipe"
											title="Work out ABV and volume from the recipe"
											disabled={avail.recalc.disabled}
											reason={avail.recalc.reason}
											onclick={recalculateRecipeMetrics}
										>
											{#snippet icon()}
												<Icon name="refresh" size={14} />
											{/snippet}
										</Button>
									{/snippet}
									<NumberField
										id="f-abv"
										size="sm"
										unit="%"
										min={0}
										max={100}
										step={0.5}
										decimals={1}
										noun="a percentage"
										value={stripUnit(item.abv, "%")}
										oninput={(e) => patchWithUnit("abv", (e.currentTarget as HTMLInputElement).value)}
									/>
								</Field>
								<Field
									class="span-2"
									label="Volume"
									for="f-volume"
									optional
									error={errors.get("f-volume")}
								>
									<NumberField
										id="f-volume"
										size="sm"
										unit="ml"
										min={0}
										step={5}
										decimals={0}
										noun="millilitres"
										example="120"
										value={stripUnit(item.volume, "ml")}
										oninput={(e) => patchWithUnit("volume", (e.currentTarget as HTMLInputElement).value)}
									/>
								</Field>
							</FormSection>
							<FormSection title="Where it appears" tooltip={ITEM_TIPS.placements}>
								{#snippet actions()}
									<OverflowMenu
										text="Add placement"
										icon="plus"
										label="Add placement"
										items={placementItems}
									/>
								{/snippet}
								<MenuPlacementsTable
									menus={posMenus}
									placements={item.placements || []}
									{sectionOptions}
									{screenSuggestions}
									drinkName={item.name || ""}
									posName={item.lightspeedName || ""}
									onposname={(next) => patch("lightspeedName", next)}
									onchange={setPlacements}
								/>
							</FormSection>
						</div>
					{:else if tab === "cost"}
						<div class="board-tab">
							<FormSection
								title="Prices"
								tooltip={ITEM_TIPS.prices}
							>
								{#snippet actions()}
									<Button
										variant="ghost"
										size="sm"
										type="button"
										aria-label="Pour cost targets"
										title="Pour targets"
										onclick={() => (pourSettingsOpen = true)}
									>
										{#snippet icon()}
											<Icon name="settings" size={14} />
										{/snippet}
									</Button>
									<Button variant="outline" size="sm" type="button" onclick={addPrice}>
										{#snippet icon()}
											<Icon name="plus" size={15} />
										{/snippet}
										Add price
									</Button>
								{/snippet}
								<PriceTable
									rows={priceRows}
									price={priceLive}
									error={errors.get}
									onchange={setPrices}
								/>
								<p class="price-note">
									{#if !hasRecipeCost}
										{showRecipe
											? "Add ingredients on Build to cost this drink."
											: "Link stock on Build to cost this drink."}
									{:else}
										Pour target {formatPourPercent(priceLive?.targetPourCost) || "n/a"}.
										{#if priceLive?.hasEstimates}<span class="estimates">Includes estimates.</span>{/if}
									{/if}
								</p>
							</FormSection>
							{#if priceLive && hasRecipeCost}
								<FormSection
									title="Against the pour target"
									tooltip={ITEM_TIPS.gauges}
								>
									<PriceGauges price={priceLive} />
								</FormSection>
							{/if}
						</div>
						<PourSettingsDialog open={pourSettingsOpen} onclose={() => (pourSettingsOpen = false)} />
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

				<EditorActionBar
					saveLabel="Save drink"
					saving={busy && busyLabel.startsWith("Saving")}
					disabled={busy}
					{dirty}
					errorCount={errors.count}
					onerrors={() => void showErrors()}
					overflow={[
						{
							label: "Delete drink",
							tone: "destructive",
							disabled: avail.delete.disabled,
							reason: avail.delete.reason,
							onselect: requestDelete,
						},
					]}
				/>
			</div>
		</div>

		<ConfirmDialog
			open={discardOpen}
			title="Discard unsaved changes?"
			message={discardKind === "reload"
				? "Reloading puts back what was last saved. Your edits will be lost."
				: "You have edits that haven't been saved. They will be lost."}
			action="Discard"
			cancelLabel="Keep editing"
			oncancel={cancelDiscard}
			onconfirm={confirmDiscard}
		/>

		<ConfirmDialog
			open={deleteOpen}
			title={`Delete ${item.name?.trim() || "this drink"}?`}
			message="It comes off every menu and the till export. This can't be undone."
			action="Delete"
			busyLabel="Deleting…"
			busy={busy && busyLabel.startsWith("Deleting")}
			disabled={busy}
			oncancel={cancelDelete}
			onconfirm={performDelete}
		/>
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

	.price-label {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
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

	.title-text {
		margin: 0;
		min-width: 0;
		color: var(--foreground);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.title-text.placeholder {
		color: var(--muted-foreground);
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

	.price-readout {
		margin: 0;
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
		line-height: 1.3;
		color: var(--foreground);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
	}

	.price-readout.muted {
		color: var(--muted-foreground);
		font-size: var(--text-lg);
	}

	.price-alt {
		color: var(--muted-foreground);
		font-size: var(--text-lg);
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

	.tabs {
		flex-shrink: 0;
		padding: var(--space-2) var(--card-pad-lg) 0;
		background: var(--card);
		border-bottom: 1px solid var(--border);
	}

	/* One card: the sections sit on it, divided by rules. */
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

	.board,
	.board-tab {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		min-width: 0;
	}

	/* Build's read-only price line: as tall as the controls beside it. */
	.edit-prices {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--muted-foreground);
		text-decoration: underline;
		text-underline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	.edit-prices:hover {
		color: var(--foreground);
	}

	.edit-prices:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}

	/* Touch: a 44px tap area that doesn't make the label row taller than its neighbours. */
	@media (pointer: coarse) {
		.edit-prices {
			position: relative;
		}

		.edit-prices::after {
			content: "";
			position: absolute;
			inset: calc((100% - 44px) / 2) -0.5rem;
		}
	}

	.price-note {
		margin: 0;
		font-size: var(--text-xs);
		line-height: 1.4;
		color: var(--muted-foreground);
	}

	.photo {
		position: relative;
		display: grid;
	}

	/* Beside the fields: the photo fills their height (FormLead `fill`, same breakpoint). */
	@container (min-width: 64rem) {
		.photo {
			min-height: 0;
		}

		.photo-frame,
		.photo-empty {
			height: 100%;
			aspect-ratio: auto;
		}
	}

	.photo-frame,
	.photo-empty {
		width: 100%;
		aspect-ratio: 1;
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.photo-frame {
		position: relative;
		border: 1px solid var(--border);
		background: var(--bg);
	}

	/* Out of flow, so the fields set the height and the photo fills it. */
	.photo-frame img {
		position: absolute;
		inset: 0;
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
		border: 1px dashed var(--border-strong);
		background: transparent;
		color: var(--muted-foreground);
		text-align: center;
		cursor: pointer;
	}

	label.photo-empty:hover,
	label.photo-empty:focus-within {
		border-color: var(--primary);
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
		inset: 0;
		display: grid;
		place-content: center;
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--primary) 14%, transparent);
		color: var(--primary);
		font-weight: 600;
		pointer-events: none;
	}

	/* Stacked under the fields: a wide banner. */
	@container (min-width: 30rem) and (max-width: 63.99rem) {
		.photo-frame,
		.photo-empty {
			aspect-ratio: 21 / 9;
		}
	}

	/* Phones: a wide photo, so the fields under it stay in reach. */
	@container drink-detail (max-width: 49.99rem) {
		.photo-frame,
		.photo-empty {
			aspect-ratio: 16 / 10;
		}
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

		.pour-readout {
			text-align: left;
		}

		.panel-head,
		.tabs,
		.tab-body {
			padding-left: max(var(--page-gutter), 1.125rem);
			padding-right: max(var(--page-gutter), 1.125rem);
		}

		.tab-body {
			padding-top: var(--space-4);
			padding-bottom: max(var(--page-gutter), 1.125rem);
		}

	}

	@media (max-width: 880px) {
		.head-tools {
			flex-wrap: wrap;
			height: auto;
			row-gap: var(--space-1);
		}

	}

	@media (max-width: 600px) {
		.title-text,
		.price-readout {
			font-size: var(--text-xl);
			letter-spacing: var(--tracking-xl);
		}
	}
</style>
