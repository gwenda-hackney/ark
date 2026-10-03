import { createImageUrlBuilder } from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url";
import type { MenuItemImage } from "../../types/menu";
import { getSanityImageConfig } from "./env";

function createBuilder() {
  const { projectId, dataset } = getSanityImageConfig();
  return createImageUrlBuilder({ projectId, dataset });
}

type SanityImageCrop = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

type SanityImageHotspot = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type SanityImageAsset = {
  _id?: string;
  url?: string | null;
  metadata?: {
    dimensions?: {
      width?: number | null;
      height?: number | null;
    } | null;
  } | null;
};

export type SanityImageField = {
  alt?: string | null;
  crop?: SanityImageCrop | null;
  hotspot?: SanityImageHotspot | null;
  asset?: SanityImageAsset | null;
} | null;

const GALLERY_BASE_WIDTH = 900;

/** @deprecated Prefer mapSanityImage — kept for tests of query param behaviour. */
export function buildSanityImageUrl(
  baseUrl: string,
  options: { width?: number; height?: number; quality?: number } = {},
): string {
  const url = new URL(baseUrl);
  if (options.width) url.searchParams.set("w", String(options.width));
  if (options.height) url.searchParams.set("h", String(options.height));
  if (options.width || options.height) {
    url.searchParams.set("fit", "crop");
    url.searchParams.set("auto", "format");
  }
  if (options.quality) url.searchParams.set("q", String(options.quality));
  return url.toString();
}

function toImageSource(
  image: NonNullable<SanityImageField>,
): SanityImageSource | null {
  const assetId = image.asset?._id;
  if (!assetId) return null;

  return {
    _type: "image",
    asset: { _type: "reference", _ref: assetId },
    ...(image.crop ? { crop: image.crop } : {}),
    ...(image.hotspot ? { hotspot: image.hotspot } : {}),
  };
}

function assetDimensions(image: NonNullable<SanityImageField>): {
  width: number;
  height: number;
} {
  return {
    width: image.asset?.metadata?.dimensions?.width ?? 1200,
    height: image.asset?.metadata?.dimensions?.height ?? 1600,
  };
}

/** Pixel size of the Studio crop region. */
function croppedPixelSize(image: NonNullable<SanityImageField>): {
  width: number;
  height: number;
} {
  const { width, height } = assetDimensions(image);
  const left = image.crop?.left ?? 0;
  const right = image.crop?.right ?? 0;
  const top = image.crop?.top ?? 0;
  const bottom = image.crop?.bottom ?? 0;

  return {
    width: width * (1 - left - right),
    height: height * (1 - top - bottom),
  };
}

/** Map Sanity hotspot to CSS object-position on the cropped image. */
export function galleryObjectPosition(
  image: NonNullable<SanityImageField>,
): string {
  const hotspot = image.hotspot;
  if (hotspot?.x == null || hotspot?.y == null) {
    return "50% 50%";
  }

  const { width, height } = assetDimensions(image);
  const cropLeft = (image.crop?.left ?? 0) * width;
  const cropTop = (image.crop?.top ?? 0) * height;
  const { width: cropW, height: cropH } = croppedPixelSize(image);

  const hotspotX = hotspot.x * width;
  const hotspotY = hotspot.y * height;

  const x = cropW > 0 ? ((hotspotX - cropLeft) / cropW) * 100 : 50;
  const y = cropH > 0 ? ((hotspotY - cropTop) / cropH) * 100 : 50;

  return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
}

/** Deliver exactly the Studio crop — scaled, never re-framed to a tile shape. */
function buildGalleryImageUrl(source: SanityImageSource): string {
  return createBuilder()
    .image(source)
    .width(GALLERY_BASE_WIDTH)
    .quality(80)
    .auto("format")
    .url();
}

const HERO_WIDTH = 1600;
const HERO_HEIGHT = 1000; // 16×10 — What's on cards and series heroes

function hasImageFraming(image: NonNullable<SanityImageField>): boolean {
  const crop = image.crop;
  const hotspot = image.hotspot;
  const cropped = Boolean(
    crop &&
    ((crop.top ?? 0) > 0.001 ||
      (crop.bottom ?? 0) > 0.001 ||
      (crop.left ?? 0) > 0.001 ||
      (crop.right ?? 0) > 0.001),
  );
  const focused = Boolean(
    hotspot &&
    (Math.abs((hotspot.x ?? 0.5) - 0.5) > 0.02 ||
      Math.abs((hotspot.y ?? 0.5) - 0.5) > 0.02),
  );
  return cropped || focused;
}

/** Full image scaled — site uses object-fit:contain so tall flyers keep the wordmark. */
function buildHeroFullUrl(source: SanityImageSource): string {
  return createBuilder()
    .image(source)
    .width(HERO_WIDTH)
    .quality(86)
    .auto("format")
    .url();
}

/** Framed hero: Studio crop + hotspot into a 16×10 CDN crop. */
function buildHeroFramedUrl(source: SanityImageSource): string {
  return createBuilder()
    .image(source)
    .width(HERO_WIDTH)
    .height(HERO_HEIGHT)
    .fit("crop")
    .quality(86)
    .auto("format")
    .url();
}

export function mapSanityHeroImage(
  image: SanityImageField,
  fallbackAlt?: string,
): MenuItemImage | undefined {
  const source = image ? toImageSource(image) : null;
  if (!source || !image) return undefined;

  const framed = hasImageFraming(image);
  return {
    url: framed ? buildHeroFramedUrl(source) : buildHeroFullUrl(source),
    width: HERO_WIDTH,
    height: framed ? HERO_HEIGHT : assetDimensions(image).height,
    objectPosition: galleryObjectPosition(image),
    alt: image.alt?.trim() || fallbackAlt,
  };
}

export function mapSanityImage(
  image: SanityImageField,
  fallbackAlt?: string,
): MenuItemImage | undefined {
  const source = image ? toImageSource(image) : null;
  if (!source) return undefined;

  const url = buildGalleryImageUrl(source);
  const { width, height } = assetDimensions(image);

  return {
    url,
    width,
    height,
    objectPosition: image ? galleryObjectPosition(image) : undefined,
    alt: image?.alt?.trim() || fallbackAlt,
  };
}

/** Homepage gallery — Studio crop is the image; hotspot pins the focal point in the tile. */
export function mapSanityGalleryImage(
  image: SanityImageField,
  fallbackAlt?: string,
): MenuItemImage | undefined {
  const source = image ? toImageSource(image) : null;
  if (!source || !image) return undefined;

  const cropSize = croppedPixelSize(image);
  const displayHeight = Math.round(
    GALLERY_BASE_WIDTH * (cropSize.height / cropSize.width),
  );

  return {
    url: buildGalleryImageUrl(source),
    width: GALLERY_BASE_WIDTH,
    height: displayHeight,
    objectPosition: galleryObjectPosition(image),
    alt: image.alt?.trim() || fallbackAlt,
  };
}
