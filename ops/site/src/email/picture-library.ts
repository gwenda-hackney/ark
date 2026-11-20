/**
 * The pictures an email can use without uploading one (#348): the venue's
 * own (the Photos page's gallery) and each event's, as Venue keeps them
 * (venue/types.ts GalleryResponse). Every one is already a Sanity image, so
 * picking one is just its asset id.
 */
import type { GalleryResponse } from "../venue/types";

export type LibraryPicture = {
	/** Its Sanity image asset id, what an Image section stores. */
	assetId: string;
	/** What it shows, as its alt text. */
	alt: string;
	/** A small copy, for the chooser. */
	thumb: string;
};

export type LibraryGroup = { title: string; pictures: LibraryPicture[] };

/** "image-<hash>-<w>x<h>-<ext>" from a Sanity image address, or "" when it isn't one. */
export function assetFromUrl(url: string): string {
	const match = /cdn\.sanity\.io\/images\/[^/]+\/[^/]+\/([a-f0-9]+-\d+x\d+)\.([a-z0-9]+)/i.exec(url || "");
	return match ? `image-${match[1]}-${match[2]}` : "";
}

/** A Sanity address at a small size, for a grid of them. */
function thumbOf(url: string): string {
	try {
		const out = new URL(url);
		if (out.hostname !== "cdn.sanity.io") return url;
		out.search = "";
		out.searchParams.set("w", "320");
		out.searchParams.set("h", "320");
		out.searchParams.set("fit", "crop");
		out.searchParams.set("auto", "format");
		return out.toString();
	} catch {
		return url;
	}
}

/** The venue's pictures first, then each event's, newest event first; none listed twice. */
export function libraryOf(gallery: GalleryResponse): LibraryGroup[] {
	const seen = new Set<string>();
	const take = (assetId: string, alt: string, url: string): LibraryPicture[] => {
		if (!assetId || seen.has(assetId)) return [];
		seen.add(assetId);
		return [{ assetId, alt, thumb: thumbOf(url) }];
	};
	const groups: LibraryGroup[] = [
		{
			title: "Gwenda",
			pictures: gallery.photos.flatMap((photo) => take(photo.asset || assetFromUrl(photo.url), photo.description || "", photo.url)),
		},
		...gallery.fromEvents.map((group) => ({
			title: group.name,
			pictures: group.photos.flatMap((photo) => take(assetFromUrl(photo.url), group.name, photo.url)),
		})),
	];
	return groups.filter((group) => group.pictures.length);
}
