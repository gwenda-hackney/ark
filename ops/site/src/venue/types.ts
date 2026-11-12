/** Venue details as the ops API sends them (functions/api/venue). */

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** A day: closed, or open from `opens` to `closes` ("HH:MM", London). A close before the opening is after midnight. */
export type OpeningDay = {
	day: DayKey;
	closed: boolean;
	opens: string;
	closes: string;
};

export type OpeningHours = {
	days: OpeningDay[];
	updatedAt: string;
	updatedBy: string;
};

/**
 * Where the details stand on the website: live (shown), preview (waiting
 * for Update website), behind (the website shows something else), none (not
 * there yet), unknown (couldn't check).
 */
export type WebsiteState = "live" | "preview" | "behind" | "none" | "unknown";

/** The party facts (parties-model.js): a blank capacity is null, blank text "". */
export type PartyFacts = {
	standing: number | null;
	seated: number | null;
	/** One thing a line. */
	included: string;
	/** "a day": the website says "We reply within a day". */
	replyWithin: string;
};

export type PartyField = keyof PartyFacts;

export type Parties = PartyFacts & {
	updatedAt: string;
	updatedBy: string;
};

/** The party facts as typed on the page, figures as strings. */
export type PartyForm = Record<PartyField, string>;

export type VenueDetailsResponse = {
	openingHours: OpeningHours | null;
	/** Null until first saved. */
	parties: Parties | null;
	website: WebsiteState;
};

export type SaveHoursResponse = VenueDetailsResponse & {
	published: boolean;
	warnings: string[];
};

export type SavePartiesResponse = SaveHoursResponse;

/** The menu board on home a photo may be pinned up on, or "" for neither. */
export type PhotoMenu = "" | "drinks" | "food";

/** A photo of the venue's gallery (gallery-model.js), as ops shows it: from the Sanity CDN. */
export type VenuePhoto = {
	key: string;
	/** Its Sanity image asset id. */
	asset: string;
	/** What it shows: the website's alt text. */
	description: string;
	menu: PhotoMenu;
	added: string;
	addedBy: string;
	url: string;
	width: number;
	height: number;
};

/** A photo from an event's gallery, as the Gallery page shows it: to see, not to change. */
export type EventGalleryPhoto = {
	key: string;
	url: string;
	width: number;
	height: number;
	added: string;
};

/**
 * An event's photos the website's Photos page shows under the venue's own
 * (venue/server/venue-gallery.js galleryFromEvents); `more` it leaves for the
 * event's own page; `tooSmall` how many of the event's photos it leaves out
 * as too small. An event left out only because its photos are all too small
 * comes after the rest, with no photos.
 */
export type EventPhotoGroup = {
	id: string;
	name: string;
	photos: EventGalleryPhoto[];
	more: number;
	tooSmall: number;
};

/** The gallery, in its order, and where the venue's details stand on the website. */
export type GalleryState = {
	photos: VenuePhoto[];
	website: WebsiteState;
};

/** The gallery, and the events' photos the Photos page shows under it, newest event first. */
export type GalleryResponse = GalleryState & {
	fromEvents: EventPhotoGroup[];
};

/** After a change: the gallery as it is now, and how putting it on the website went. */
export type GalleryChangeResponse = GalleryState & {
	published: boolean;
	warnings: string[];
};

/** After an upload: `added` lists the keys of the photos that went in (none when it was there already). */
export type GalleryAddResponse = GalleryChangeResponse & { added: string[] };
