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
