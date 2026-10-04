import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { cardPhotoUrl, menuCard, menuCardBadges } from "./menu-card.ts";
import type { MenuListItem } from "./menu-list.ts";

function row(extra: Partial<MenuListItem> = {}): MenuListItem {
	return {
		_kind: "item",
		_id: "a",
		name: "Ambra",
		drinkType: "cocktail",
		sectionId: "s1",
		section: { _id: "s1", title: "Our Formulas" },
		_priceLabel: "£11",
		_typeLabel: "Cocktail",
		_categoryLabel: "Sour",
		_costLabel: "~£1.92",
		_pourLabel: "~17.5%",
		_pourTone: "up",
		_pourHint: "On target.",
		_issueCount: 0,
		_posStatus: "matched",
		_guestPlacement: "both",
		...extra,
	};
}

describe("menu card", () => {
	it("maps the fields a card shows", () => {
		const card = menuCard(row({ image: { asset: { url: "https://cdn.sanity.io/x.jpg" } } }));
		assert.equal(card.id, "a");
		assert.equal(card.title, "Ambra");
		assert.equal(card.section, "Our Formulas");
		assert.equal(card.kind, "Sour");
		assert.equal(card.photo, "https://cdn.sanity.io/x.jpg");
		assert.equal(card.price, "£11");
		assert.equal(card.cost, "~£1.92");
		assert.deepEqual(card.pour, { label: "~17.5%", tone: "success", hint: "On target." });
		assert.deepEqual(card.badges, []);
	});

	it("names the chapter of a subsection and falls back without a photo or price", () => {
		const card = menuCard(
			row({
				name: "  ",
				drinkType: "beer",
				section: { _id: "s2", title: "Draught", parentTitle: "Beer" },
				_priceLabel: "—",
				_categoryLabel: "—",
				_pourTone: "",
				_pourLabel: undefined,
				_pourHint: undefined,
			}),
		);
		assert.equal(card.title, "Untitled");
		assert.equal(card.section, "Beer · Draught");
		assert.equal(card.kind, "Cocktail");
		assert.equal(
			menuCard(row({ section: { _id: "s3", title: "Spritz" }, _categoryLabel: "Spritz" })).kind,
			"",
		);
		assert.equal(card.photo, "");
		assert.deepEqual(card.swatch, { initial: "U", hue: "beer" });
		assert.equal(card.price, "No price");
		assert.deepEqual(card.pour, { label: "—", tone: "neutral", hint: "" });
	});

	it("shows only the badges worth a second look", () => {
		const badges = menuCardBadges(
			row({
				_issueCount: 3,
				_issueTone: "loss",
				_issueHint: "1 critical",
				_posStatus: "missing",
				_publishPending: true,
				publish: { production: { status: "missing" } },
				_guestPlacement: "none",
			}),
		);
		assert.deepEqual(
			badges.map((badge) => [badge.label, badge.tone]),
			[
				["3 issues", "danger"],
				["Not in POS", "danger"],
				["Not live", "warning"],
				["POS only", "neutral"],
			],
		);
		assert.equal(badges[0]?.title, "1 critical");
		assert.equal(badges[2]?.title, "Not on the live website");
		assert.deepEqual(
			menuCardBadges(row({ _issueCount: 1, _issueTone: "down" })).map((b) => [b.label, b.tone]),
			[["1 issue", "warning"]],
		);
	});

	it("says Changed, not Not live, when saved edits wait for the website", () => {
		const badges = menuCardBadges(
			row({ _publishPending: true, publish: { production: { status: "stale", changed: ["price"] } } } as unknown as Partial<MenuListItem>),
		);
		expect(badges.map((badge) => badge.label)).toContain("Changed");
		for (const badge of badges) expect(badge.label.length).toBeLessThanOrEqual(14);
	});

	it("tones pour cost by margin", () => {
		assert.equal(menuCard(row({ _pourTone: "down" })).pour.tone, "warning");
		assert.equal(menuCard(row({ _pourTone: "loss" })).pour.tone, "danger");
	});
});

describe("cardPhotoUrl", () => {
	it("asks Sanity for a 4:3 crop and leaves other hosts alone", () => {
		assert.equal(
			cardPhotoUrl("https://cdn.sanity.io/images/x/y/abc.jpg?w=96"),
			"https://cdn.sanity.io/images/x/y/abc.jpg?w=640&h=480&fit=crop&auto=format",
		);
		assert.equal(cardPhotoUrl("https://files.baserow.io/a.jpg"), "https://files.baserow.io/a.jpg");
		assert.equal(cardPhotoUrl(""), "");
	});
});
