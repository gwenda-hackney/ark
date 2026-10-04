/**
 * Hero framing for What's on: one 16×10 window on the source photo.
 * Stored as Sanity crop + hotspot so publish/CDN can reuse it.
 */

export const HERO_ASPECT = 16 / 10;

/** Tightest crop is this many times closer than the frame-filling crop. */
export const HERO_ZOOM_MAX = 2.5;

export type HeroCropRect = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

export type HeroHotspot = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type HeroFraming = {
	crop: HeroCropRect;
	hotspot: HeroHotspot;
	/**
	 * "whole": the site shows the photo uncropped inside the 16×10 frame, on
	 * a blurred copy of itself (#27); crop and hotspot are then unused.
	 */
	fit?: "whole";
};

/** Square and portrait photos (flyers) look best whole; landscape fills. */
export function prefersWholeImage(width: number, height: number): boolean {
	return width > 0 && height > 0 && height >= width * 0.95;
}

export function isWholeImage(value: unknown): boolean {
	return Boolean(value && typeof value === "object" && (value as { fit?: unknown }).fit === "whole");
}

/** Framing for "show the whole image". */
export function wholeImageFraming(): HeroFraming {
	return { crop: emptyCrop(), hotspot: { x: 0.5, y: 0.5, width: 1, height: 1 }, fit: "whole" };
}

function clamp01(value: unknown): number {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return Math.min(1, Math.max(0, n));
}

export function emptyCrop(): HeroCropRect {
	return { left: 0, top: 0, right: 0, bottom: 0 };
}

export function normalizeCrop(rect: unknown): HeroCropRect {
	if (!rect || typeof rect !== "object") return emptyCrop();
	const row = rect as Record<string, unknown>;
	let left = clamp01(row.left);
	let top = clamp01(row.top);
	let right = clamp01(row.right);
	let bottom = clamp01(row.bottom);
	if (left + right >= 0.98) {
		left = 0;
		right = 0;
	}
	if (top + bottom >= 0.98) {
		top = 0;
		bottom = 0;
	}
	return { left, top, right, bottom };
}

/** Cover window for a target aspect. biasY 0=top, 1=bottom (default prefers wordmarks). */
export function coverWindow(
	imageWidth: number,
	imageHeight: number,
	aspect = HERO_ASPECT,
	biasY = 0.78,
): HeroCropRect {
	const w = Math.max(1, Number(imageWidth) || 1);
	const h = Math.max(1, Number(imageHeight) || 1);
	const imageAspect = w / h;
	if (imageAspect > aspect) {
		const visibleW = h * aspect;
		const inset = (w - visibleW) / (2 * w);
		return { left: inset, top: 0, right: inset, bottom: 0 };
	}
	const visibleH = w / aspect;
	const insetTotal = Math.max(0, (h - visibleH) / h);
	const y = Math.min(1, Math.max(0, biasY));
	const top = insetTotal * y;
	return { left: 0, top, right: 0, bottom: insetTotal - top };
}

/** Largest 16×10 rectangle that fits inside the photo, in source pixels. */
export function coverFrameSize(
	imageWidth: number,
	imageHeight: number,
	aspect = HERO_ASPECT,
): { width: number; height: number } {
	const w = Math.max(1, Number(imageWidth) || 1);
	const h = Math.max(1, Number(imageHeight) || 1);
	if (w / h > aspect) return { width: h * aspect, height: h };
	return { width: w, height: w / aspect };
}

/**
 * A 16×10 window inside the photo. Center is in source pixels.
 * The window is shifted, never stretched, so it stays inside the photo.
 */
export function clampFrame(
	imageWidth: number,
	imageHeight: number,
	centerX: number,
	centerY: number,
	frameWidth: number,
	frameHeight: number,
	aspect = HERO_ASPECT,
): HeroCropRect {
	const w = Math.max(1, Number(imageWidth) || 1);
	const h = Math.max(1, Number(imageHeight) || 1);
	const cover = coverFrameSize(w, h, aspect);
	let fw = Math.min(Math.max(1, frameWidth), cover.width);
	let fh = fw / aspect;
	if (fh > cover.height) {
		fh = cover.height;
		fw = fh * aspect;
	}
	let x = centerX - fw / 2;
	let y = centerY - fh / 2;
	x = Math.min(Math.max(0, x), w - fw);
	y = Math.min(Math.max(0, y), h - fh);
	return {
		left: x / w,
		top: y / h,
		right: (w - x - fw) / w,
		bottom: (h - y - fh) / h,
	};
}

/**
 * The 16×10 card inside a stored crop. Same rule as the site: fit the card
 * inside the saved rectangle, kept on the hotspot.
 */
export function cardFrameFromCrop(
	crop: HeroCropRect,
	imageWidth: number,
	imageHeight: number,
	hotspot?: { x?: number; y?: number } | null,
	aspect = HERO_ASPECT,
): HeroCropRect {
	const w = Math.max(1, Number(imageWidth) || 1);
	const h = Math.max(1, Number(imageHeight) || 1);
	const left = clamp01(crop.left);
	const top = clamp01(crop.top);
	const right = clamp01(crop.right);
	const bottom = clamp01(crop.bottom);
	const storedW = Math.max(1, w * (1 - left - right));
	const storedH = Math.max(1, h * (1 - top - bottom));
	const frameW = storedW / storedH > aspect ? storedH * aspect : storedW;
	const frameH = frameW / aspect;
	const cx =
		hotspot && Number.isFinite(Number(hotspot.x))
			? Number(hotspot.x) * w
			: left * w + storedW / 2;
	const cy =
		hotspot && Number.isFinite(Number(hotspot.y))
			? Number(hotspot.y) * h
			: top * h + storedH / 2;
	const minX = left * w;
	const minY = top * h;
	let x = cx - frameW / 2;
	let y = cy - frameH / 2;
	x = Math.min(Math.max(minX, x), minX + storedW - frameW);
	y = Math.min(Math.max(minY, y), minY + storedH - frameH);
	x = Math.min(Math.max(0, x), w - frameW);
	y = Math.min(Math.max(0, y), h - frameH);
	return {
		left: x / w,
		top: y / h,
		right: (w - x - frameW) / w,
		bottom: (h - y - frameH) / h,
	};
}

/** Slider 0 fills the card. Slider 1 is the tightest crop. */
export function zoomFromFrame(
	crop: HeroCropRect,
	imageWidth: number,
	imageHeight: number,
	aspect = HERO_ASPECT,
): number {
	const cover = coverFrameSize(imageWidth, imageHeight, aspect);
	const visibleW = Math.max(1, (1 - crop.left - crop.right) * imageWidth);
	const zoom = cover.width / visibleW;
	if (!(zoom > 1) || HERO_ZOOM_MAX <= 1) return 0;
	return Math.min(1, Math.max(0, Math.log(zoom) / Math.log(HERO_ZOOM_MAX)));
}

export function framingFromWindow(crop: HeroCropRect): HeroFraming {
	const rect = normalizeCrop(crop);
	const width = Math.max(0.05, 1 - rect.left - rect.right);
	const height = Math.max(0.05, 1 - rect.top - rect.bottom);
	return {
		crop: rect,
		hotspot: {
			x: rect.left + width / 2,
			y: rect.top + height / 2,
			width: Math.min(0.2, width),
			height: Math.min(0.2, height),
		},
	};
}

export function normalizeHotspot(
	hotspot: unknown,
	crop: HeroCropRect = emptyCrop(),
): HeroHotspot {
	const visibleW = Math.max(0.05, 1 - crop.left - crop.right);
	const visibleH = Math.max(0.05, 1 - crop.top - crop.bottom);
	if (!hotspot || typeof hotspot !== "object") {
		return framingFromWindow(crop).hotspot;
	}
	const row = hotspot as Record<string, unknown>;
	let width = clamp01(row.width) || 0.18;
	let height = clamp01(row.height) || 0.18;
	width = Math.min(Math.max(0.08, width), visibleW);
	height = Math.min(Math.max(0.08, height), visibleH);
	let x = clamp01(row.x);
	let y = clamp01(row.y);
	x = Math.min(Math.max(crop.left + width / 2, x), 1 - crop.right - width / 2);
	y = Math.min(Math.max(crop.top + height / 2, y), 1 - crop.bottom - height / 2);
	return { x, y, width, height };
}

/** Accept {crop,hotspot} or legacy {main,card}. */
export function normalizeHeroFraming(value: unknown): HeroFraming {
	const source =
		value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	let crop = normalizeCrop(source.crop);
	if (!source.crop && (source.main || source.card)) {
		crop = normalizeCrop(source.main || source.card);
	}
	if (source.fit === "whole") return wholeImageFraming();
	return {
		crop,
		hotspot: normalizeHotspot(source.hotspot, crop),
	};
}

export function parseHeroFraming(raw: unknown): HeroFraming | null {
	if (!raw) return null;
	if (typeof raw === "object") return normalizeHeroFraming(raw);
	try {
		return normalizeHeroFraming(JSON.parse(String(raw)));
	} catch {
		return null;
	}
}

export function hasMeaningfulFraming(value: HeroFraming | null | undefined) {
	if (!value) return false;
	if (value.fit === "whole") return true;
	const { crop } = value;
	return Boolean(crop.left || crop.top || crop.right || crop.bottom);
}

export function defaultHeroFraming(
	imageWidth = 16,
	imageHeight = 10,
): HeroFraming {
	return framingFromWindow(coverWindow(imageWidth, imageHeight));
}

export function serializeHeroFraming(framing: unknown): string {
	return JSON.stringify(normalizeHeroFraming(framing));
}

/** Place the source so the crop window fills a frame (exact site preview). */
export function cropFrameStyle(crop: HeroCropRect) {
	const rect = normalizeCrop(crop);
	const visibleW = Math.max(0.01, 1 - rect.left - rect.right);
	const visibleH = Math.max(0.01, 1 - rect.top - rect.bottom);
	return {
		width: `${(1 / visibleW) * 100}%`,
		height: `${(1 / visibleH) * 100}%`,
		left: `${(-rect.left / visibleW) * 100}%`,
		top: `${(-rect.top / visibleH) * 100}%`,
	};
}

export function hotspotObjectPosition(hotspot: HeroHotspot | null | undefined) {
	if (!hotspot) return "50% 55%";
	return `${(clamp01(hotspot.x) * 100).toFixed(1)}% ${(clamp01(hotspot.y) * 100).toFixed(1)}%`;
}

/** Prefer exact crop window for previews; fall back to cover+hotspot. */
export function heroCoverStyle(framing: HeroFraming | null | undefined) {
	if (framing && hasMeaningfulFraming(framing)) {
		const placed = cropFrameStyle(framing.crop);
		return {
			...placed,
			objectFit: "fill" as const,
			objectPosition: "center",
			positioned: true as const,
		};
	}
	return {
		width: "100%",
		height: "100%",
		left: "0",
		top: "0",
		objectFit: "cover" as const,
		objectPosition: hotspotObjectPosition(framing?.hotspot),
		positioned: false as const,
	};
}

export type HeroCrops = HeroFraming;
export const normalizeHeroCrops = normalizeHeroFraming;
export const parseHeroCrops = parseHeroFraming;
export const defaultHeroCrops = defaultHeroFraming;
export const serializeHeroCrops = serializeHeroFraming;
