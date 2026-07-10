import type { MenuItemImage } from "../../types/menu";

type SanityImageAsset = {
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
  asset?: SanityImageAsset | null;
} | null;

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

export function mapSanityImage(
  image: SanityImageField,
  fallbackAlt?: string,
): MenuItemImage | undefined {
  const baseUrl = image?.asset?.url;
  if (!baseUrl) return undefined;

  const width = image.asset?.metadata?.dimensions?.width ?? 1200;
  const height = image.asset?.metadata?.dimensions?.height ?? 1600;

  return {
    url: buildSanityImageUrl(baseUrl, { width: 900, quality: 80 }),
    width,
    height,
    alt: image.alt?.trim() || fallbackAlt,
  };
}
