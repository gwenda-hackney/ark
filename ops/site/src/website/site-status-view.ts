/**
 * The Website page's status card: what one site's state says, in plain words.
 * Kept out of WebPage.svelte so the wording is testable.
 */
import type { SiteStatus } from "../app/api";

export type Tone = "ok" | "waiting" | "updating" | "paused" | "failed" | "unknown";

export function clock(iso: string | null): string {
	if (!iso) return "";
	return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

export function when(iso: string | null): string {
	if (!iso) return "";
	const date = new Date(iso);
	const today = new Date();
	const sameDay = date.toDateString() === today.toDateString();
	return sameDay
		? `today at ${clock(iso)}`
		: date.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function changes(count: number): string {
	return count === 1 ? "1 change" : `${count} changes`;
}

/**
 * Most urgent first. A build that is running, or one that needs a person,
 * still shows while paused; otherwise the pause comes first, because nothing
 * the other states promise ("at about 3:40", "we'll try again") happens
 * while local ops runs.
 */
export function statusOf(site: SiteStatus | null): { tone: Tone; title: string; note: string } {
	if (!site) return { tone: "unknown", title: "Checking the website…", note: "" };
	if (site.needsHelp) {
		return {
			tone: "failed",
			title: "The website didn't update",
			note: "We tried twice. Press Try again. If it still doesn't work, tell Dan.",
		};
	}
	if (site.updating) {
		return {
			tone: "updating",
			title: "The website is updating",
			note: "This usually takes about a minute. You can keep working.",
		};
	}
	if (site.paused) {
		const who = site.paused.by ? ` (${site.paused.by})` : "";
		return {
			tone: "paused",
			title: `Paused: local ops is running (since ${clock(site.paused.since)})`,
			note:
				`A developer${who} is running ops on their machine against dev's data, so dev ops doesn't ` +
				"update the website by itself, which could undo their changes. Update website still works. " +
				"Automatic updates start again a few minutes after local ops stops.",
		};
	}
	if (site.failed) {
		return {
			tone: "failed",
			title: "The website didn't update",
			note: `We'll try again by itself${site.autoUpdateAt ? ` at about ${clock(site.autoUpdateAt)}` : " soon"}.`,
		};
	}
	if (!site.known) {
		return {
			tone: "unknown",
			title: "Not tracked yet",
			note: "Changes are tracked from the next website update.",
		};
	}
	if (site.items.length) {
		return {
			tone: "waiting",
			title: `${changes(site.items.length)} will appear on the website${site.autoUpdateAt ? ` at about ${clock(site.autoUpdateAt)}` : " soon"}`,
			note: "Events already show them. Artist pages and the menu update then.",
		};
	}
	return {
		tone: "ok",
		title: "The website is up to date",
		note: site.builtAt ? `Last updated ${when(site.builtAt)}.` : "",
	};
}
