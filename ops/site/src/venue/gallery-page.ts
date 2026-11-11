/**
 * Gallery page (#291), the parts without a screen: the photos as tiles,
 * where a drag or a move button puts one, and what a change says.
 */
import { eventItemPath } from "../app/nav";
import type { SelectOption } from "../ui/types";
import { moveKey } from "./gallery-model.js";
import type { EventPhotoGroup, GalleryChangeResponse, PhotoMenu, VenuePhoto } from "./types";

/** One photo as the page shows it. */
export type PhotoTile = {
	key: string;
	/** A square for the tile, from the Sanity CDN. */
	thumb: string;
	/** The photo itself, for the dialog and a new tab. */
	full: string;
	/** What it shows, or a nudge to say. */
	label: string;
	described: boolean;
	/** "Drinks board", "Food board" or "". */
	board: string;
	/** Its place on the website, 1 first. */
	place: number;
};

/** The menu boards on home, as the dialog offers them. */
export const MENU_OPTIONS: SelectOption[] = [
	{ value: "", label: "Neither" },
	{ value: "drinks", label: "Drinks board" },
	{ value: "food", label: "Food board" },
];

export function boardName(menu: PhotoMenu | string): string {
	return MENU_OPTIONS.find((option) => option.value && option.value === menu)?.label ?? "";
}

/** A square for a tile, from the Sanity CDN. */
const squareOf = (url: string) => (url ? `${url}?w=400&h=400&fit=crop&auto=format` : "");

export function photoTiles(photos: VenuePhoto[]): PhotoTile[] {
	return photos.map((photo, index) => ({
		key: photo.key,
		thumb: squareOf(photo.url),
		full: photo.url,
		label: photo.description || "Not described yet",
		described: Boolean(photo.description),
		board: boardName(photo.menu),
		place: index + 1,
	}));
}

/** The order after dragging `dragged` onto `target`: it takes the target's place. */
export function droppedOrder(keys: string[], dragged: string, target: string): string[] {
	if (!keys.includes(dragged) || !keys.includes(target) || dragged === target) return [...keys];
	return moveKey(keys, dragged, keys.indexOf(target));
}

export type Move = "top" | "up" | "down";

/** The order after moving one photo to the top, or one place up or down. */
export function movedOrder(keys: string[], key: string, move: Move): string[] {
	const at = keys.indexOf(key);
	if (at < 0) return [...keys];
	const to = move === "top" ? 0 : move === "up" ? at - 1 : at + 1;
	return moveKey(keys, key, Math.max(0, Math.min(keys.length - 1, to)));
}

/** True when two orders are the same. */
export function sameOrder(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** What a change says: `done` is "Saved", "Moved", "Photo removed"… */
export function changedMessage(done: string, result: Pick<GalleryChangeResponse, "published" | "website">): string {
	if (result.published) return `${done}. Website pages follow after their next update, in about 15 minutes.`;
	if (result.website === "preview") return `${done} for the preview. Update website on the Website page puts it live.`;
	return `${done} in ops.`;
}

/** What an upload of `tried` files says, when `added` of them went in. */
export function uploadedMessage(added: number, tried: number): string {
	if (!added) return tried === 1 ? "That photo's in the gallery already." : "Those photos are in the gallery already.";
	const what = added === 1 ? "Photo added" : `${added} photos added`;
	const skipped = tried - added;
	return `${what} at the top${skipped ? ` (${skipped} already there)` : ""}. Open one to say what it shows.`;
}

/** The line under the photos. */
export function galleryFootnote(count: number, phone: boolean): string {
	if (!count) return "No photos yet. Add some and they go on the website.";
	const photos = count === 1 ? "1 photo" : `${count} photos`;
	return phone
		? `${photos}. Open one to say what it shows or move it.`
		: `${photos}. Drag one to move it, or open it to say what it shows.`;
}

/** An event's photos as the page shows them: under its name, with the way to its Images tab. */
export type EventSection = {
	id: string;
	name: string;
	/** Its Images tab, where they're managed. */
	href: string;
	tiles: Array<{ key: string; thumb: string; full: string; label: string }>;
	/** "3 more on its Images tab", or "". */
	more: string;
};

export function eventSections(groups: EventPhotoGroup[]): EventSection[] {
	return groups.map((group) => ({
		id: group.id,
		name: group.name,
		href: eventItemPath(group.id, "gallery"),
		tiles: group.photos.map((photo, index) => ({
			key: photo.key,
			thumb: squareOf(photo.url),
			full: photo.url,
			label: `${group.name}, photo ${index + 1}`,
		})),
		more: group.more > 0 ? `${group.more} more on its Images tab` : "",
	}));
}

/** The line under the photos from events. */
export function fromEventsFootnote(count: number): string {
	if (!count) return "No event photos on the website yet. Add some on an event's Images tab.";
	if (count === 1) return "1 event on the Photos page. Home's photo strip mixes in its newest photo.";
	return `${count} events on the Photos page, newest first. Home's photo strip mixes in a couple of their newest.`;
}
