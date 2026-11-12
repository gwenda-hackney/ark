/**
 * The website's rule for a photo's size, where the app takes it from: the
 * website's own (marketing/web/src/lib/photos.js, which holds itself to what
 * ops relies on in photos.ops.contract.test.js). A photo from an event under
 * PHOTOS_PAGE_MIN on its long side is left out of the Photos page and home's
 * photo strip; a venue photo that small still shows, but may look blurry.
 * Each photo's size comes with it from the API (its Sanity asset's).
 */
import { EVENT_PHOTO_MIN, tooSmallForPhotos } from "../../../../marketing/web/src/lib/photos.js";

/** How many pixels the Photos page needs on a photo's long side. */
export const PHOTOS_PAGE_MIN: number = EVENT_PHOTO_MIN;

type Sized = { width: number; height: number };

/** True when the Photos page would leave the photo out (or show it soft) for its size. */
export function tooSmallForPhotosPage(photo: Sized): boolean {
	return tooSmallForPhotos(photo);
}

/** "240 × 240" */
export function photoSize(photo: Sized): string {
	return `${photo.width} × ${photo.height}`;
}
