/**
 * Venue details page (#240), the parts without a screen: what the website
 * line says, what a save says, changing one day of the week, and the party
 * facts as typed.
 */
import type { BadgeTone } from "../ui";
import { DAYS, openingDay } from "./hours-model.js";
import { partyFacts } from "./parties-model.js";
import type { DayKey, OpeningDay, Parties, PartyForm, SaveHoursResponse, WebsiteState } from "./types";

/** What a card's badge and messages call what it holds. */
export type VenueNoun = "hours" | "party details" | "photos";

/** Where the details stand on the website, in a badge. */
export function websiteBadge(
	state: WebsiteState,
	noun: VenueNoun = "hours",
): { label: string; tone: BadgeTone; hint: string } {
	switch (state) {
		case "live":
			return { label: "On the website", tone: "success", hint: `The website shows these ${noun}.` };
		case "preview":
			return {
				label: "Waiting for Update website",
				tone: "warning",
				hint: "The preview shows them. Update website on the Website page puts them live.",
			};
		case "behind":
			return {
				label: `Website shows other ${noun === "party details" ? "details" : noun}`,
				tone: "warning",
				hint: `Save again to put these ${noun} on the website.`,
			};
		case "none":
			return { label: "Not on the website yet", tone: "neutral", hint: "Saving puts them on the website." };
		default:
			return { label: "Website not checked", tone: "neutral", hint: "Couldn't reach the website to check." };
	}
}

/** What a save says. */
export function savedMessage(
	result: Pick<SaveHoursResponse, "published" | "website">,
	noun: VenueNoun = "hours",
): string {
	if (result.published) {
		return `Saved. Website pages show the new ${noun} after their next update, in about 15 minutes.`;
	}
	if (result.website === "preview") return "Saved for the preview. Update website on the Website page puts it live.";
	return "Saved in ops.";
}

/** The party facts as the page's fields hold them: blank for a fact not filled in. */
export function partyForm(parties: Parties | null): PartyForm {
	const facts = partyFacts(parties ?? {});
	return {
		standing: facts.standing == null ? "" : String(facts.standing),
		seated: facts.seated == null ? "" : String(facts.seated),
		included: facts.included,
		replyWithin: facts.replyWithin,
	};
}

/** True when the fields say something other than what's saved (tidying aside). */
export function partiesChanged(form: PartyForm, saved: Parties | null): boolean {
	const now = partyFacts(form);
	const was = partyFacts(saved ?? {});
	return (
		now.standing !== was.standing ||
		now.seated !== was.seated ||
		now.included !== was.included ||
		now.replyWithin !== was.replyWithin
	);
}

/** The week with one day replaced, Monday first. */
export function withDay(days: OpeningDay[], changed: OpeningDay): OpeningDay[] {
	const byDay = new Map<DayKey, OpeningDay>(days.map((day) => [day.day, day]));
	byDay.set(changed.day, openingDay(changed) as OpeningDay);
	return DAYS.map((key) => byDay.get(key as DayKey) ?? (openingDay({ day: key }) as OpeningDay));
}

/** A week with nothing set, before the hours are first saved. */
export function blankWeek(): OpeningDay[] {
	return DAYS.map((key) => openingDay({ day: key }) as OpeningDay);
}
