/**
 * The Images tab's photos, the parts without a screen: each as a tile, with
 * a badge when it's too small for the website's Photos page (the website's
 * rule, website/photos-page.ts), and what an upload says.
 *
 * Too small, a photo is left out of the Photos page and home's photo strip,
 * but the event's own page shows every photo in its gallery
 * (marketing/web/src/lib/event-card.js renderGallery); that page is up while
 * the event has nights to come (functions/_lib/event-pages.js).
 */
import type { OpsGalleryPhoto } from "../app/api";
import { PHOTOS_PAGE_MIN, photoSize, tooSmallForPhotosPage } from "../website/photos-page";

/** One photo as the Images tab shows it. */
export type GalleryTile = {
	key: string;
	name: string;
	thumb: string;
	full: string;
	/** Why it's badged too small, in plain words (its tooltip and label); "" when it isn't. */
	small: string;
};

/** Why a photo is too small for the Photos page, or "" when it isn't. */
export function tooSmallNote(photo: OpsGalleryPhoto): string {
	if (!tooSmallForPhotosPage(photo)) return "";
	return (
		`${photoSize(photo)}. The Photos page needs ${PHOTOS_PAGE_MIN} px on the long side, so it's left out there. ` +
		"It still shows on the event's own page while the event has nights to come."
	);
}

export function galleryTiles(photos: OpsGalleryPhoto[]): GalleryTile[] {
	return photos.map((photo) => ({
		key: photo.key,
		name: photo.date ? `Photo from ${photo.date}` : "Photo",
		thumb: `${photo.url}?w=400&h=400&fit=crop&auto=format`,
		full: photo.url,
		small: tooSmallNote(photo),
	}));
}

/** What an upload of `tried` images says; `added` the photos that went in (none for one there already). */
export function uploadedMessage(tried: number, added: OpsGalleryPhoto[]): string {
	const done = tried === 1 ? "Image uploaded." : `${tried} images uploaded.`;
	const small = added.filter(tooSmallForPhotosPage);
	const needs = `too small for the Photos page (it needs ${PHOTOS_PAGE_MIN} px).`;
	if (!small.length) return done;
	if (small.length === 1) {
		return `${done} ${tried === 1 ? "It's" : "One is"} ${photoSize(small[0])}, ${needs}`;
	}
	return `${done} ${small.length} are ${needs}`;
}
