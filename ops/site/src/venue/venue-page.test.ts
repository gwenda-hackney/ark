import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { blankWeek, partiesChanged, partyForm, savedMessage, websiteBadge, withDay } from "./venue-page";
import type { OpeningDay, Parties } from "./types";

describe("venue details page", () => {
	it("says where the hours stand on the website", () => {
		assert.deepEqual(
			(["live", "preview", "behind", "none", "unknown"] as const).map((state) => websiteBadge(state).label),
			[
				"On the website",
				"Waiting for Update website",
				"Website shows other hours",
				"Not on the website yet",
				"Website not checked",
			],
		);
		assert.equal(websiteBadge("live").tone, "success");
	});

	it("says what a save did", () => {
		assert.match(savedMessage({ published: true, website: "live" }), /^Saved\. Website pages show/);
		assert.match(savedMessage({ published: false, website: "preview" }), /Update website on the Website page/);
		assert.equal(savedMessage({ published: false, website: "unknown" }), "Saved in ops.");
	});

	it("changes one day and keeps the week Monday first", () => {
		const week = blankWeek();
		assert.deepEqual(
			week.map((day) => day.day),
			["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
		);
		const next = withDay(week, { day: "sat", closed: false, opens: "16:00", closes: "01:00" });
		assert.deepEqual(next[5], { day: "sat", closed: false, opens: "16:00", closes: "01:00" });
		assert.equal(next.length, 7);
		// A day marked closed drops its times
		const shut = withDay(next, { day: "sat", closed: true, opens: "16:00", closes: "01:00" } as OpeningDay);
		assert.deepEqual(shut[5], { day: "sat", closed: true, opens: "", closes: "" });
	});

	it("says the party details' own words", () => {
		assert.equal(websiteBadge("behind", "party details").label, "Website shows other details");
		assert.equal(websiteBadge("live", "party details").hint, "The website shows these party details.");
		assert.match(savedMessage({ published: true, website: "live" }, "party details"), /show the new party details/);
	});

	it("puts the party facts in the fields, blank for none", () => {
		assert.deepEqual(partyForm(null), { standing: "", seated: "", included: "", replyWithin: "" });
		const saved: Parties = {
			standing: 80,
			seated: null,
			included: "No hire fee",
			replyWithin: "a day",
			updatedAt: "2026-11-11T10:00:00.000Z",
			updatedBy: "owner@gwenda.co.uk",
		};
		assert.deepEqual(partyForm(saved), { standing: "80", seated: "", included: "No hire fee", replyWithin: "a day" });
	});

	it("knows when the party facts were changed, tidying aside", () => {
		const saved: Parties = {
			standing: 80,
			seated: null,
			included: "No hire fee",
			replyWithin: "a day",
			updatedAt: "",
			updatedBy: "",
		};
		assert.equal(partiesChanged(partyForm(saved), saved), false);
		assert.equal(partiesChanged({ ...partyForm(saved), included: " No hire fee \n" }, saved), false);
		assert.equal(partiesChanged({ ...partyForm(saved), seated: "40" }, saved), true);
		assert.equal(partiesChanged(partyForm(null), null), false);
		assert.equal(partiesChanged({ ...partyForm(null), replyWithin: "a day" }, null), true);
	});
});
