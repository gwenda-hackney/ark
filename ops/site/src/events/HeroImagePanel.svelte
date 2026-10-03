<script lang="ts">
	/**
	 * Crop the What's on card: the whole photo stays visible, and the 16×10
	 * frame on it is exactly what the site shows. Drag the frame, zoom to tighten.
	 */
	import Icon from "../app/shell/Icon.svelte";
	import { Tip } from "../ui";
	import {
		HERO_ASPECT,
		HERO_ZOOM_MAX,
		cardFrameFromCrop,
		clampFrame,
		coverFrameSize,
		coverWindow,
		framingFromWindow,
		hasMeaningfulFraming,
		normalizeHeroFraming,
		serializeHeroFraming,
		zoomFromFrame,
		type HeroCropRect,
		type HeroFraming,
	} from "./hero-crops";

	let {
		sourceUrl = "",
		crops = null as HeroFraming | null,
		disabled = false,
		locked = false,
		tooltip = "",
		heading = "Hero",
		onchangecrops,
		onpickfile,
		onclear,
	}: {
		sourceUrl?: string;
		crops?: HeroFraming | null;
		/** Blank when the surrounding section already titles it. */
		heading?: string;
		disabled?: boolean;
		locked?: boolean;
		tooltip?: string;
		onchangecrops: (
			crops: HeroFraming | null,
			meta: { width: number; height: number },
		) => void;
		onpickfile: (file: File) => void;
		onclear: () => void;
	} = $props();

	/** The uploaded file in Baserow, the only copy. A photo not yet saved (blob:) has none. */
	const originalUrl = $derived(/^https?:\/\//i.test(sourceUrl) ? sourceUrl : "");

	let naturalW = $state(0);
	let naturalH = $state(0);
	let windowCrop = $state<HeroCropRect>({ left: 0, top: 0, right: 0, bottom: 0 });
	let stageEl = $state<HTMLDivElement | null>(null);
	let stageW = $state(0);
	let stageH = $state(0);
	let loadedFor = $state("");
	let dragging = $state(false);
	let slider = $state(0);
	let sliderHeld = $state(false);
	let fileDrop = $state(false);
	let fileDropDepth = 0;
	let startX = 0;
	let startY = 0;
	let origin = $state<HeroCropRect>({ left: 0, top: 0, right: 0, bottom: 0 });

	const imageBox = $derived.by(() => {
		if (!naturalW || !naturalH || stageW < 2 || stageH < 2) {
			return { x: 0, y: 0, w: 0, h: 0 };
		}
		const scale = Math.min(stageW / naturalW, stageH / naturalH);
		const w = naturalW * scale;
		const h = naturalH * scale;
		return { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h };
	});

	const cropBox = $derived.by(() => {
		const box = imageBox;
		if (!box.w) return { x: 0, y: 0, w: 0, h: 0 };
		const width = Math.max(0, 1 - windowCrop.left - windowCrop.right);
		const height = Math.max(0, 1 - windowCrop.top - windowCrop.bottom);
		return {
			x: box.x + windowCrop.left * box.w,
			y: box.y + windowCrop.top * box.h,
			w: width * box.w,
			h: height * box.h,
		};
	});

	let seenUrl = "";
	let seenCropKey = "";
	let seenSize = "";

	function coverRect(): HeroCropRect {
		const cover = coverWindow(naturalW, naturalH, HERO_ASPECT, 0.5);
		const size = coverFrameSize(naturalW, naturalH);
		const cx = (cover.left + (1 - cover.left - cover.right) / 2) * naturalW;
		const cy = (cover.top + (1 - cover.top - cover.bottom) / 2) * naturalH;
		return clampFrame(naturalW, naturalH, cx, cy, size.width, size.height);
	}

	function rectForIncoming(value: HeroFraming | null): HeroCropRect {
		if (!naturalW || !naturalH) return { left: 0, top: 0, right: 0, bottom: 0 };
		if (value && hasMeaningfulFraming(normalizeHeroFraming(value))) {
			const framing = normalizeHeroFraming(value);
			return cardFrameFromCrop(framing.crop, naturalW, naturalH, framing.hotspot);
		}
		return coverRect();
	}

	$effect(() => {
		const el = stageEl;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const box = entries[0]?.contentRect;
			if (!box) return;
			stageW = box.width;
			stageH = box.height;
		});
		observer.observe(el);
		return () => observer.disconnect();
	});

	$effect(() => {
		const el = stageEl;
		if (!el) return;
		const onWheel = (event: WheelEvent) => {
			if (disabled || !naturalW) return;
			event.preventDefault();
			const zoom = HERO_ZOOM_MAX ** slider;
			const next = Math.min(
				HERO_ZOOM_MAX,
				Math.max(1, zoom * (event.deltaY > 0 ? 0.92 : 1.08)),
			);
			applyZoom(next);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	});

	$effect(() => {
		if (sliderHeld || dragging) return;
		const url = sourceUrl;
		const w = naturalW;
		const h = naturalH;
		const cropKey =
			crops && hasMeaningfulFraming(normalizeHeroFraming(crops))
				? serializeHeroFraming(crops)
				: "";
		const size = `${w}x${h}`;
		if (url === seenUrl && cropKey === seenCropKey && size === seenSize) return;
		seenUrl = url;
		seenCropKey = cropKey;
		seenSize = size;
		if (!w || !h) return;
		const next = rectForIncoming(crops);
		windowCrop = next;
		slider = zoomFromFrame(next, w, h);
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
		};
		image.src = url;
		return () => {
			cancelled = true;
		};
	});

	function commit(rect: HeroCropRect) {
		windowCrop = rect;
		if (!sliderHeld) slider = zoomFromFrame(rect, naturalW, naturalH);
		onchangecrops(framingFromWindow(rect), {
			width: naturalW,
			height: naturalH,
		});
	}

	function applyZoom(zoom: number) {
		const size = coverFrameSize(naturalW, naturalH);
		const visibleW = 1 - windowCrop.left - windowCrop.right;
		const visibleH = 1 - windowCrop.top - windowCrop.bottom;
		const cx = (windowCrop.left + visibleW / 2) * naturalW;
		const cy = (windowCrop.top + visibleH / 2) * naturalH;
		commit(
			clampFrame(
				naturalW,
				naturalH,
				cx,
				cy,
				size.width / zoom,
				size.height / zoom,
			),
		);
	}

	function onPointerDown(e: PointerEvent) {
		if (disabled || !naturalW || !imageBox.w) return;
		e.preventDefault();
		dragging = true;
		startX = e.clientX;
		startY = e.clientY;
		origin = { ...windowCrop };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || !imageBox.w) return;
		const visibleW = 1 - origin.left - origin.right;
		const visibleH = 1 - origin.top - origin.bottom;
		const dx = (e.clientX - startX) / imageBox.w;
		const dy = (e.clientY - startY) / imageBox.h;
		const cx = (origin.left + dx + visibleW / 2) * naturalW;
		const cy = (origin.top + dy + visibleH / 2) * naturalH;
		commit(
			clampFrame(naturalW, naturalH, cx, cy, visibleW * naturalW, visibleH * naturalH),
		);
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
		sliderHeld = true;
		slider = Math.min(1, Math.max(0, Number((e.currentTarget as HTMLInputElement).value)));
		applyZoom(HERO_ZOOM_MAX ** slider);
	}

	function releaseZoom() {
		sliderHeld = false;
	}

	function nudgeZoom(direction: number) {
		if (!naturalW || !naturalH || disabled) return;
		const zoom = HERO_ZOOM_MAX ** slider;
		const next = Math.min(HERO_ZOOM_MAX, Math.max(1, zoom * (direction > 0 ? 1.15 : 1 / 1.15)));
		sliderHeld = false;
		applyZoom(next);
	}

	function resetFraming() {
		if (!naturalW || !naturalH) return;
		sliderHeld = false;
		commit(coverRect());
	}

	function onFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) onpickfile(file);
	}

	function onFileDragEnter(e: DragEvent) {
		e.preventDefault();
		if (disabled || locked) return;
		fileDropDepth += 1;
		if (e.dataTransfer?.types.includes("Files")) fileDrop = true;
	}

	function onFileDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
	}

	function onFileDragLeave(e: DragEvent) {
		e.preventDefault();
		fileDropDepth = Math.max(0, fileDropDepth - 1);
		if (fileDropDepth === 0) fileDrop = false;
	}

	function onFileDrop(e: DragEvent) {
		e.preventDefault();
		fileDropDepth = 0;
		fileDrop = false;
		if (disabled || locked) return;
		const file = e.dataTransfer?.files?.[0];
		if (file && file.type.startsWith("image/")) onpickfile(file);
	}
</script>

<section
	class="hero-framing"
	class:dropping={fileDrop}
	role="group"
	aria-label="What's on photo"
	ondragenter={onFileDragEnter}
	ondragover={onFileDragOver}
	ondragleave={onFileDragLeave}
	ondrop={onFileDrop}
>
	{#if heading || !locked}
	<header class="hero-head" class:end={!heading}>
		{#if heading}
			<h2 class="section-title">
				{heading}
				{#if tooltip}
					<Tip label={heading} {tooltip} />
				{/if}
			</h2>
		{/if}
		{#if !locked}
			<div class="hero-actions">
				<label class="pick camera">
					<input
						class="sr-only"
						type="file"
						accept="image/*"
						capture="environment"
						disabled={disabled}
						onchange={onFile}
					/>
					<span class="pick-btn"><Icon name="camera" size={15} /> Take photo</span>
				</label>
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
				<button class="pick-btn remove" type="button" {disabled} onclick={onclear}>
					Remove
				</button>
			{/if}
			{#if originalUrl}
				<a class="pick-btn" href={originalUrl} download target="_blank" rel="noopener">
					<Icon name="download" size={15} /> Original
				</a>
			{/if}
			</div>
		{/if}
	</header>
	{/if}

	{#if locked}
		{#if sourceUrl}
			<div class="locked-preview">
				<img src={sourceUrl} alt="" />
			</div>
			{#if originalUrl}
				<a class="pick-btn" href={originalUrl} download target="_blank" rel="noopener">
					<Icon name="download" size={15} /> Original
				</a>
			{/if}
		{:else}
			<p class="locked-empty">No series photo</p>
		{/if}
	{:else if !sourceUrl}
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
			class="stage"
			bind:this={stageEl}
			role="presentation"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			<img
				class="source"
				src={sourceUrl}
				alt=""
				draggable="false"
				style:left="{imageBox.x}px"
				style:top="{imageBox.y}px"
				style:width="{imageBox.w}px"
				style:height="{imageBox.h}px"
			/>
			{#if cropBox.w > 0}
				<div
					class="crop-box"
					style:left="{cropBox.x}px"
					style:top="{cropBox.y}px"
					style:width="{cropBox.w}px"
					style:height="{cropBox.h}px"
				></div>
			{/if}
		</div>

		<div class="controls">
			<label class="zoom">
				<span class="zoom-label">
					Zoom
					<Tip
						label="Zoom"
						tooltip="Tightens the gold frame on the photo. Drag the frame to move it. Scroll over the photo to zoom too."
					/>
				</span>
				<button
					class="step"
					type="button"
					aria-label="Zoom out"
					disabled={disabled || !naturalW || slider <= 0.001}
					onclick={() => nudgeZoom(-1)}
				>
					−
				</button>
				<input
					type="range"
					min="0"
					max="1"
					step="0.001"
					value={slider}
					aria-label="Zoom"
					disabled={disabled || !naturalW}
					onpointerdown={() => (sliderHeld = true)}
					oninput={onZoomInput}
					onchange={releaseZoom}
					onpointerup={releaseZoom}
				/>
				<button
					class="step"
					type="button"
					aria-label="Zoom in"
					disabled={disabled || !naturalW || slider >= 0.999}
					onclick={() => nudgeZoom(1)}
				>
					+
				</button>
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
		gap: var(--space-3);
	}

	.hero-head {
		display: flex;
		gap: var(--space-4);
		justify-content: space-between;
		align-items: center;
	}

	.hero-head.end {
		justify-content: flex-end;
	}

	.section-title {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: var(--space-2);
	}

	.pick {
		display: inline-flex;
		cursor: pointer;
	}

	/* Phones and tablets only: opens the camera straight away. */
	.pick.camera {
		display: none;
	}

	@media (pointer: coarse) {
		.pick.camera {
			display: inline-flex;
		}
	}

	.pick-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: var(--control-h-sm);
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.pick-btn.remove:hover:not(:disabled),
	.pick-btn.remove:focus-visible {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	a.pick-btn {
		text-decoration: none;
		width: fit-content;
	}

	.pick-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.empty {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 16 / 10;
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		cursor: pointer;
	}

	.empty:hover {
		border-color: var(--border-strong, var(--border));
	}

	.empty-label {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.locked-preview {
		width: 100%;
		aspect-ratio: 16 / 10;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg);
	}

	.locked-preview img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.locked-empty {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 16 / 10;
		margin: 0;
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.stage {
		position: relative;
		width: 100%;
		height: min(42vh, 22rem);
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg);
		cursor: grab;
		touch-action: none;
		user-select: none;
	}

	.stage:active {
		cursor: grabbing;
	}

	.source {
		position: absolute;
		max-width: none;
		pointer-events: none;
	}

	.crop-box {
		position: absolute;
		box-sizing: border-box;
		border: 2px solid var(--primary);
		box-shadow: 0 0 0 999px rgba(13, 13, 13, 0.62);
		pointer-events: none;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-4);
		align-items: center;
	}

	.hero-framing.dropping .stage,
	.hero-framing.dropping .empty {
		border-color: var(--primary);
	}

	.zoom {
		display: grid;
		grid-template-columns: auto auto minmax(6rem, 1fr) auto;
		gap: var(--space-2);
		align-items: center;
		flex: 1 1 12rem;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.zoom-label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.zoom input[type="range"] {
		width: 100%;
		height: 1.25rem;
		margin: 0;
		accent-color: var(--primary);
		cursor: pointer;
	}

	.step {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: var(--foreground);
		font-size: var(--text-md);
		line-height: 1;
		cursor: pointer;
	}

	.step:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.reset {
		height: var(--control-h-sm);
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}
</style>
