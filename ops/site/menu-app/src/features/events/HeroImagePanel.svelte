<script lang="ts">
	/**
	 * Frame the hero for What's on: one 16×10 window.
	 * Drag to pan, zoom to pull in more of a tall flyer. Preview = live site.
	 */
	import { Tip } from "../../ui";
	import {
		HERO_ASPECT,
		coverWindow,
		cropFrameStyle,
		framingFromWindow,
		hasMeaningfulFraming,
		normalizeCrop,
		normalizeHeroFraming,
		type HeroCropRect,
		type HeroFraming,
	} from "./hero-crops";

	let {
		sourceUrl = "",
		crops = null as HeroFraming | null,
		disabled = false,
		tooltip = "",
		onchangecrops,
		onpickfile,
	}: {
		sourceUrl?: string;
		crops?: HeroFraming | null;
		disabled?: boolean;
		tooltip?: string;
		onchangecrops: (
			crops: HeroFraming | null,
			meta: { width: number; height: number },
		) => void;
		onpickfile: (file: File) => void;
	} = $props();

	let naturalW = $state(0);
	let naturalH = $state(0);
	let windowCrop = $state<HeroCropRect>({ left: 0, top: 0, right: 0, bottom: 0 });
	let frameEl = $state<HTMLDivElement | null>(null);
	let loadedFor = $state("");
	let dragging = $state(false);
	let startX = 0;
	let startY = 0;
	let origin = $state<HeroCropRect>({ left: 0, top: 0, right: 0, bottom: 0 });

	const cover = $derived(
		naturalW && naturalH
			? coverWindow(naturalW, naturalH, HERO_ASPECT, 0.5)
			: coverWindow(16, 10, HERO_ASPECT, 0.5),
	);

	const showingFullPoster = $derived(!hasWindow(windowCrop));

	/**
	 * Zoom 0 = whole poster in the frame (letterboxed).
	 * Zoom 1 = fill the 16×10 window (cover). Higher = tighter.
	 */
	const zoom = $derived.by(() => {
		if (showingFullPoster) return 0;
		const coverW = 1 - cover.left - cover.right;
		const currentW = Math.max(0.05, 1 - windowCrop.left - windowCrop.right);
		return coverW / currentW;
	});

	const frameStyle = $derived(
		showingFullPoster
			? {
					width: "100%",
					height: "100%",
					left: "0%",
					top: "0%",
					objectFit: "contain" as const,
				}
			: { ...cropFrameStyle(windowCrop), objectFit: "fill" as const },
	);

	$effect(() => {
		const incoming = crops;
		if (incoming == null) {
			if (hasWindow(windowCrop)) {
				windowCrop = { left: 0, top: 0, right: 0, bottom: 0 };
			}
			return;
		}
		const next = normalizeHeroFraming(incoming);
		const rect = normalizeCrop(next.crop);
		const nextCrop = hasWindow(rect)
			? rect
			: { left: 0, top: 0, right: 0, bottom: 0 };
		if (JSON.stringify(windowCrop) !== JSON.stringify(nextCrop)) {
			windowCrop = nextCrop;
		}
	});

	$effect(() => {
		const url = sourceUrl;
		if (!url) {
			naturalW = 0;
			naturalH = 0;
			loadedFor = "";
			return;
		}
		if (url === loadedFor) return;
		const image = new Image();
		let cancelled = false;
		image.onload = () => {
			if (cancelled) return;
			naturalW = image.naturalWidth;
			naturalH = image.naturalHeight;
			loadedFor = url;
			if (crops == null || !hasMeaningfulFraming(normalizeHeroFraming(crops))) {
				windowCrop = { left: 0, top: 0, right: 0, bottom: 0 };
			}
		};
		image.src = url;
		return () => {
			cancelled = true;
		};
	});

	function hasWindow(rect: HeroCropRect) {
		return Boolean(rect.left || rect.top || rect.right || rect.bottom);
	}

	function commit(rect: HeroCropRect) {
		windowCrop = rect;
		if (!hasWindow(rect)) {
			onchangecrops(null, { width: naturalW, height: naturalH });
			return;
		}
		onchangecrops(framingFromWindow(rect), {
			width: naturalW,
			height: naturalH,
		});
	}

	function clampWindow(left: number, top: number, visibleW: number, visibleH: number) {
		const maxLeft = Math.max(0, 1 - visibleW);
		const maxTop = Math.max(0, 1 - visibleH);
		const nextLeft = Math.min(Math.max(0, left), maxLeft);
		const nextTop = Math.min(Math.max(0, top), maxTop);
		return {
			left: nextLeft,
			top: nextTop,
			right: 1 - visibleW - nextLeft,
			bottom: 1 - visibleH - nextTop,
		};
	}

	function onPointerDown(e: PointerEvent) {
		if (disabled || !naturalW || showingFullPoster) return;
		e.preventDefault();
		dragging = true;
		startX = e.clientX;
		startY = e.clientY;
		origin = { ...windowCrop };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || !frameEl) return;
		const frame = frameEl.getBoundingClientRect();
		const visibleW = 1 - origin.left - origin.right;
		const visibleH = 1 - origin.top - origin.bottom;
		const dx = ((e.clientX - startX) / frame.width) * visibleW;
		const dy = ((e.clientY - startY) / frame.height) * visibleH;
		commit(clampWindow(origin.left - dx, origin.top - dy, visibleW, visibleH));
	}

	function onPointerUp(e: PointerEvent) {
		dragging = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	function onZoomInput(e: Event) {
		if (!naturalW || !naturalH) return;
		const nextZoom = Number((e.currentTarget as HTMLInputElement).value);
		if (nextZoom <= 0.02) {
			commit({ left: 0, top: 0, right: 0, bottom: 0 });
			return;
		}
		const coverW = 1 - cover.left - cover.right;
		const coverH = 1 - cover.top - cover.bottom;
		const visibleW = coverW / nextZoom;
		const visibleH = coverH / nextZoom;
		const cx = showingFullPoster
			? 0.5
			: windowCrop.left + (1 - windowCrop.left - windowCrop.right) / 2;
		const cy = showingFullPoster
			? 0.5
			: windowCrop.top + (1 - windowCrop.top - windowCrop.bottom) / 2;
		commit(clampWindow(cx - visibleW / 2, cy - visibleH / 2, visibleW, visibleH));
	}

	function resetFraming() {
		commit({ left: 0, top: 0, right: 0, bottom: 0 });
	}

	function onFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) onpickfile(file);
	}
</script>

<section class="hero-framing">
	<header class="hero-head">
		<h2 class="section-title">
			Hero
			{#if tooltip}
				<Tip label="Hero" {tooltip} />
			{/if}
		</h2>
		{#if sourceUrl}
			<label class="pick">
				<input
					class="sr-only"
					type="file"
					accept="image/jpeg,image/png,image/webp,image/gif"
					disabled={disabled}
					onchange={onFile}
				/>
				<span class="pick-btn">Replace</span>
			</label>
		{/if}
	</header>

	{#if !sourceUrl}
		<label class="empty">
			<input
				class="sr-only"
				type="file"
				accept="image/jpeg,image/png,image/webp,image/gif"
				disabled={disabled}
				onchange={onFile}
			/>
			<span class="empty-label">Add photo</span>
		</label>
	{:else}
		<div
			class="frame"
			style:aspect-ratio={String(HERO_ASPECT)}
			bind:this={frameEl}
			role="presentation"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			<img
				class="source"
				class:contain={showingFullPoster}
				src={sourceUrl}
				alt=""
				draggable="false"
				style:width={frameStyle.width}
				style:height={frameStyle.height}
				style:left={frameStyle.left}
				style:top={frameStyle.top}
				style:object-fit={frameStyle.objectFit}
			/>
		</div>

		<div class="controls">
			<label class="zoom">
				<span class="zoom-label">
					Zoom
					<Tip
						label="Zoom"
						tooltip="0 shows the whole poster. Drag to pan. Higher values fill the What's on crop."
					/>
				</span>
				<input
					type="range"
					min="0"
					max="2.5"
					step="0.01"
					value={zoom}
					disabled={disabled || !naturalW}
					oninput={onZoomInput}
				/>
			</label>
			<button class="reset" type="button" disabled={disabled || !naturalW} onclick={resetFraming}>
				Reset
			</button>
		</div>
	{/if}
</section>

<style>
	.hero-framing {
		display: grid;
		gap: 0.75rem;
	}

	.hero-head {
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		align-items: center;
	}

	.section-title {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.pick {
		display: inline-flex;
		cursor: pointer;
	}

	.pick-btn {
		display: inline-flex;
		align-items: center;
		height: var(--control-h-sm);
		padding: 0 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.35rem;
		background: var(--surface);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.empty {
		display: grid;
		place-items: center;
		width: min(100%, 36rem);
		aspect-ratio: 16 / 10;
		border: 1px dashed var(--border);
		border-radius: 0.4rem;
		background: var(--surface);
		cursor: pointer;
	}

	.empty:hover {
		border-color: var(--border-strong, var(--border));
	}

	.empty-label {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.frame {
		position: relative;
		width: min(100%, 36rem);
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		background: #0d0d0d;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}

	.frame:active {
		cursor: grabbing;
	}

	.source {
		position: absolute;
		max-width: none;
		pointer-events: none;
	}

	.source.contain {
		object-fit: contain;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1rem;
		align-items: center;
		max-width: 36rem;
	}

	.zoom {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.75rem;
		align-items: center;
		flex: 1 1 12rem;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.zoom-label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.zoom input {
		width: 100%;
	}

	.reset {
		height: var(--control-h-sm);
		padding: 0 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.35rem;
		background: var(--surface);
		color: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}
</style>
