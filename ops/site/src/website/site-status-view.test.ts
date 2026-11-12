import { describe, expect, it } from "vitest";
import type { SiteStatus } from "../app/api";
import { statusOf } from "./site-status-view";
import { updateNowAction } from "./web-page-actions";

const site: SiteStatus = {
	site: "production",
	known: true,
	builtAt: null,
	items: [],
	updating: false,
	runUrl: "",
	failed: false,
	needsHelp: false,
	lastError: "",
	autoUpdateAt: null,
	paused: null,
};
const change = { kind: "document", id: "a", change: "changed", label: "Jazz Night" } as SiteStatus["items"][number];
const SINCE = "2026-11-12T10:20:00Z";
/** The time as the page shows it, in this machine's time zone. */
const shown = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
const paused = { ...site, items: [change], paused: { since: SINCE, by: "dev@example.com" } };

describe("the Website page while local ops is running (#300)", () => {
	it("says the automatic update is paused, since when, and what that means", () => {
		const view = statusOf(paused);
		expect(view.tone).toBe("paused");
		expect(view.title).toBe(`Paused: local ops is running (since ${shown(SINCE)})`);
		expect(view.note).toContain("dev@example.com");
		expect(view.note).toContain("Update website still works");
		expect(view.note).toContain("a few minutes after local ops stops");
	});

	it("nothing happens by itself while paused, so it outranks waiting, up to date and a retry", () => {
		expect(statusOf({ ...paused, items: [] }).tone).toBe("paused");
		expect(statusOf({ ...paused, failed: true }).tone).toBe("paused");
	});

	it("a build someone started still shows as updating; a site that needs help still asks for it", () => {
		expect(statusOf({ ...paused, updating: true }).tone).toBe("updating");
		expect(statusOf({ ...paused, failed: true, needsHelp: true }).title).toBe("The website didn't update");
	});

	it("Update website now stays where it is, and works", () => {
		expect(updateNowAction(paused, false, false)).toEqual({ disabled: false });
	});

	it("without a pause, the page reads as before", () => {
		expect(statusOf({ ...site, items: [change] }).tone).toBe("waiting");
		expect(statusOf(site).title).toBe("The website is up to date");
	});
});
