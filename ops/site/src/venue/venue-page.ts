/**
 * Venue details page (#240), the parts without a screen: what the website
 * line says, what a save says, and changing one day of the week.
 */
import type { BadgeTone } from "../ui";
import { DAYS, openingDay } from "./hours-model.js";
import type { DayKey, OpeningDay, SaveHoursResponse, WebsiteState } from "./types";

/** Where the details stand on the website, in a badge. */
export function websiteBadge(state: WebsiteState): { label: string; tone: BadgeTone; hint: string } {
	switch (state) {
		case "live":
			return { label: "On the website", tone: "success", hint: "The website shows these hours." };
		case "preview":
			return {
				label: "Waiting for Update website",
				tone: "warning",
				hint: "The preview shows them. Update website on the Website page puts them live.",
			};
		case "behind":
			return {
				label: "Website shows other hours",
				tone: "warning",
				hint: "Save again to put these hours on the website.",
			};
		case "none":
			return { label: "Not on the website yet", tone: "neutral", hint: "Saving puts them on the website." };
		default:
			return { label: "Website not checked", tone: "neutral", hint: "Couldn't reach the website to check." };
	}
}

/** What a save says. */
export function savedMessage(result: Pick<SaveHoursResponse, "published" | "website">): string {
	if (result.published) return "Saved. Website pages show the new hours after their next update, in about 15 minutes.";
	if (result.website === "preview") return "Saved for the preview. Update website on the Website page puts it live.";
	return "Saved in ops.";
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
