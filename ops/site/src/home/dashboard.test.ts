import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	SENTRY_ISSUES_URL,
	applicationsSummary,
	dayLabel,
	featuredArtistEnding,
	groupNights,
	marginLine,
	needsAttention,
	nightHref,
	nightStatus,
	siteHealthState,
	summarizeDrinks,
	targetGrossMargin,
} from "./dashboard.ts";
import type {
	DashboardData,
	DashboardNight,
	DashboardSubmission,
	HealthSite,
	WebsiteErrors,
} from "./dashboard-data.ts";
import { DEFAULT_POUR_TARGETS } from "../menu/types.ts";
import type { InventoryItem } from "../inventory/types.ts";
import type { MenuItem } from "../menu/types.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────

const tradeSpirit: InventoryItem = {
	id: "vr",
	_id: "vr",
	name: "Vecchia Romagna Etichetta Nera",
	fullName: "VECCHIA ROMAGNA ETICHETTA NERA 70CL",
	kind: "liquor",
	abv: "40",
	suppliers: [{ name: "LWC Drinks", pack: "BOTTLE", price: 17.5 }],
};

const estimatedJuice: InventoryItem = {
	id: "lemon",
	_id: "lemon",
	name: "Lemon juice",
	kind: "juice",
	estimatedCost: 8,
};

const expensiveSpirit: InventoryItem = {
	id: "whisky",
	_id: "whisky",
	name: "Showpiece whisky",
	fullName: "SHOWPIECE WHISKY 70CL",
	kind: "liquor",
	abv: "43",
	suppliers: [{ name: "LWC Drinks", pack: "BOTTLE", price: 80 }],
};

function sour(overrides: Partial<MenuItem> = {}): MenuItem {
	return {
		_id: "sour",
		name: "House sour",
		drinkType: "cocktail",
		price: "12",
		ingredients: [
			{ inventoryId: "vr", name: "Vecchia Romagna Etichetta Nera", quantity: 40, unit: "ml" },
			{ inventoryId: "lemon", name: "Lemon juice", quantity: 20, unit: "ml" },
		],
		...overrides,
	};
}

function site(overrides: Partial<HealthSite> = {}): HealthSite {
	return {
		id: "production",
		url: "https://gwenda.co.uk",
		ok: true,
		down: false,
		consecutiveFails: 0,
		lastCheckedAt: Date.parse("2026-10-03T16:00:00Z"),
		lastError: "",
		checks: [{ name: "home", ok: true, status: 200, error: "" }],
		...overrides,
	};
}

function submission(overrides: Partial<DashboardSubmission> = {}): DashboardSubmission {
	return {
		id: "1",
		name: "Ada",
		email: "ada@example.com",
		formSlug: "play",
		formTitle: "Play at Gwenda",
		submittedAt: "2026-10-01T10:00:00Z",
		decision: "",
		notifySentAt: "2026-10-01T10:00:05Z",
		receiptSentAt: "2026-10-01T10:00:06Z",
		...overrides,
	};
}

/** A quiet world: every section answered and nothing to do. */
function quiet(): DashboardData {
	return {
		ok: true,
		checkedAt: "2026-10-03T16:05:00Z",
		events: { ok: true, data: { today: "2026-10-03", days: 7, nights: [], waitingForUpdate: [] } },
		jobs: { ok: true, data: { jobs: [] } },
		pending: {
			ok: true,
			data: {
				local: false,
				urls: { live: "https://gwenda.co.uk", preview: "https://preview.gwenda-blue.pages.dev" },
				production: {
					known: true,
					builtAt: null,
					count: 0,
					items: [],
					updating: false,
					runUrl: "",
					failed: false,
					needsHelp: false,
					lastError: "",
					autoUpdateAt: null,
				},
				preview: {
					known: true,
					builtAt: null,
					count: 0,
					items: [],
					updating: false,
					runUrl: "",
					failed: false,
					needsHelp: false,
					lastError: "",
					autoUpdateAt: null,
				},
			},
		},
		health: { ok: true, data: { production: site(), preview: site({ id: "preview" }) } },
		forms: { ok: true, data: { toReview: [], emailFailed: [] } },
		artists: { ok: true, data: { current: null, next: null } },
	};
}

const noErrors: WebsiteErrors = {
	configured: true,
	period: "24h",
	total: 0,
	capped: false,
	events: 0,
	newCount: 0,
	issues: [],
	checkedAt: "2026-10-03T16:05:00Z",
};

function night(overrides: Partial<DashboardNight> = {}): DashboardNight {
	return {
		eventId: "12",
		date: "2026-10-03",
		title: "Radio Gwenda",
		artist: "",
		startTime: "19:00",
		endTime: "23:00",
		live: "current",
		preview: "current",
		calendarBehind: 0,
		...overrides,
	};
}

// ─── Needs attention ─────────────────────────────────────────────────────

describe("needsAttention", () => {
	it("says all clear when every source answered and nothing waits", () => {
		const attention = needsAttention(quiet(), noErrors);
		assert.deepEqual(attention.items, []);
		assert.equal(attention.allClear, true);
		assert.equal(attention.allClearText, "Site up, nothing waiting, no new errors");
	});

	it("still says all clear without Sentry, but does not promise no errors", () => {
		const attention = needsAttention(quiet(), { configured: false });
		assert.equal(attention.allClear, true);
		assert.equal(attention.allClearText, "Site up, nothing waiting");
	});

	it("counts each thing to do, most urgent first, with deep links", () => {
		const data = quiet();
		data.forms = { ok: true, data: { toReview: [submission(), submission({ id: "2" })], emailFailed: [] } };
		data.jobs = {
			ok: true,
			data: {
				jobs: [
					{ eventId: "1", name: "A", state: "failed", error: "Sanity said no", failedAt: null },
					{ eventId: "2", name: "B", state: "waiting", error: "", failedAt: null },
				],
			},
		};
		data.events = {
			ok: true,
			data: { today: "2026-10-03", days: 7, nights: [], waitingForUpdate: [{ id: "3", name: "C", change: "changed" }] },
		};
		if (data.pending.ok) data.pending.data.production.count = 4;
		data.health = { ok: true, data: { production: site({ ok: false, down: true }), preview: site({ id: "preview" }) } };
		const attention = needsAttention(data, { ...noErrors, total: 3, newCount: 2 });

		assert.equal(attention.allClear, false);
		assert.deepEqual(
			attention.items.map((item) => [item.key, item.count, item.href]),
			[
				["site-down", 1, "/web"],
				["jobs-failed", 1, "/web"],
				["errors-new", 2, SENTRY_ISSUES_URL],
				["applications", 2, "/forms"],
				["events-waiting", 1, "/web"],
				["changes-waiting", 4, "/web"],
			],
		);
		assert.equal(attention.items[0].label, "site down");
		const failingPreview = quiet();
		failingPreview.health = { ok: true, data: { production: site(), preview: site({ id: "preview", ok: false }) } };
		assert.equal(needsAttention(failingPreview, noErrors).items[0].label, "preview site failing checks");
		assert.equal(attention.items[0].tone, "danger");
		assert.equal(attention.items[3].label, "applications to review");
		assert.equal(attention.items[3].tone, "warning");
	});

	it("shows a failed website update instead of the waiting count", () => {
		const data = quiet();
		if (data.pending.ok) {
			data.pending.data.production.count = 2;
			data.pending.data.production.failed = true;
		}
		const keys = needsAttention(data, noErrors).items.map((item) => item.key);
		assert.deepEqual(keys, ["update-failed"]);
	});

	it("never calls a failed or loading source all clear", () => {
		const data = quiet();
		data.forms = { ok: false, error: "Could not load applications." };
		const attention = needsAttention(data, noErrors);
		assert.equal(attention.allClear, false);
		assert.deepEqual(attention.unknown, ["applications"]);

		const loading = needsAttention(null, null);
		assert.equal(loading.allClear, false);
		assert.ok(loading.unknown.includes("events"));
		assert.ok(loading.unknown.includes("errors"));

		const sentryDown = needsAttention(quiet(), null, { errorsFailed: true });
		assert.deepEqual(sentryDown.unknown, ["errors"]);
	});
});

// ─── Tonight and the next 7 days ─────────────────────────────────────────

describe("groupNights", () => {
	it("puts tonight first, then each day, earliest start first", () => {
		const groups = groupNights(
			[
				night({ eventId: "3", date: "2026-10-05", title: "Gwenda Selects" }),
				night({ eventId: "2", date: "2026-10-03", title: "Late one", startTime: "22:00" }),
				night({ eventId: "1", date: "2026-10-03", title: "Early one", startTime: "18:00" }),
				night({ eventId: "4", date: "2026-10-04", title: "Tomorrow's" }),
				night({ eventId: "5", date: "2026-10-02", title: "Yesterday" }),
			],
			"2026-10-03",
		);
		assert.deepEqual(
			groups.map((group) => [group.label, group.tonight, group.nights.map((n) => n.title)]),
			[
				["Tonight", true, ["Early one", "Late one"]],
				["Tomorrow", false, ["Tomorrow's"]],
				["Mon 5 Oct", false, ["Gwenda Selects"]],
			],
		);
	});

	it("labels days plainly", () => {
		assert.equal(dayLabel("2026-10-03", "2026-10-03"), "Tonight");
		assert.equal(dayLabel("2026-10-04", "2026-10-03"), "Tomorrow");
		assert.equal(dayLabel("2026-10-10", "2026-10-03"), "Sat 10 Oct");
	});

	it("says what happens next on the website, job first", () => {
		assert.equal(nightStatus(night(), []).label, "On the website");
		assert.equal(nightStatus(night({ live: "stale" }), []).label, "Waiting for Update website");
		assert.equal(nightStatus(night({ live: "unpublished" }), null).label, "Not on the website yet");
		const failed = [{ eventId: "12", name: "R", state: "failed" as const, error: "x", failedAt: null }];
		assert.deepEqual(nightStatus(night(), failed), { label: "Not ready for the website", tone: "danger" });
		assert.equal(nightHref(night()), "/events/12@2026-10-03");
	});
});

// ─── Cards ───────────────────────────────────────────────────────────────

describe("applicationsSummary", () => {
	it("counts applications to review and how long the oldest has waited", () => {
		const now = Date.parse("2026-10-03T12:00:00Z");
		const summary = applicationsSummary(
			{
				toReview: [
					submission({ id: "b", submittedAt: "2026-10-03T09:00:00Z" }),
					submission({ id: "a", submittedAt: "2026-09-28T09:00:00Z" }),
				],
				emailFailed: [submission({ id: "c", notifySentAt: "" })],
			},
			now,
		);
		assert.equal(summary.count, 2);
		assert.equal(summary.oldest, "5 days ago");
		assert.deepEqual(summary.rows.map((row) => [row.id, row.age]), [
			["a", "5 days ago"],
			["b", "today"],
		]);
		assert.equal(summary.emailFailed, 1);
		assert.equal(applicationsSummary(null).count, 0);
	});
});

describe("siteHealthState", () => {
	it("reads down, failing checks and up", () => {
		assert.equal(siteHealthState(site()).label, "Up");
		assert.equal(siteHealthState(site({ down: true, ok: false })).label, "Down");
		assert.equal(
			siteHealthState(site({ checks: [{ name: "menu", ok: false, status: 500, error: "" }] })).tone,
			"danger",
		);
		assert.equal(siteHealthState(null).label, "Not checked");
	});
});

describe("featuredArtistEnding", () => {
	const october = new Date(2026, 9, 3);
	const artist = { id: "1", name: "Rita Matos", startMonth: "9", endMonth: "10" };

	it("warns when the current artist ends this month and nobody is next", () => {
		assert.equal(featuredArtistEnding({ current: artist, next: null }, october), "Rita Matos");
	});

	it("stays quiet when someone is next or the artist stays on", () => {
		assert.equal(featuredArtistEnding({ current: artist, next: { ...artist, id: "2" } }, october), null);
		assert.equal(featuredArtistEnding({ current: { ...artist, endMonth: "11" }, next: null }, october), null);
		assert.equal(featuredArtistEnding(null, october), null);
	});
});

describe("summarizeDrinks", () => {
	it("lists drinks sold at a loss first and only counts warnings", () => {
		const fine = sour({ _id: "fine", name: "House sour", price: "14", method: "shake" });
		const loss = sour({
			_id: "loss",
			name: "Dear old fashion",
			price: "3",
			method: "stir",
			ingredients: [{ inventoryId: "whisky", name: "Showpiece whisky", quantity: 50, unit: "ml" }],
		});
		const summary = summarizeDrinks([fine, loss], [tradeSpirit, estimatedJuice, expensiveSpirit], DEFAULT_POUR_TARGETS);
		assert.equal(summary.recipeCount, 2);
		assert.equal(summary.atLoss, 1);
		assert.equal(summary.rows[0].name, "Dear old fashion");
		assert.equal(summary.rows[0].atLoss, true);
		assert.equal(summary.rows[0].href, "/menu/dear-old-fashion/analysis");
		assert.ok(summary.rows.every((row) => row.atLoss || row.critical > 0));
		assert.equal(summary.avgTargetMargin, 80);
		assert.ok(summary.avgGrossMargin != null);
	});

	it("says margin in one line against the target", () => {
		const base = summarizeDrinks([], [], DEFAULT_POUR_TARGETS);
		assert.equal(marginLine(base), null);
		assert.deepEqual(marginLine({ ...base, avgGrossMargin: 78, avgTargetMargin: 80, marginVsTarget: -2 }), {
			text: "Average margin 78%, 2% under the 80% target.",
			tone: "warning",
		});
		assert.equal(
			marginLine({ ...base, avgGrossMargin: 80.5, avgTargetMargin: 80, marginVsTarget: 0.5 })?.text,
			"Average margin 80.5%, on the 80% target.",
		);
		assert.equal(targetGrossMargin(20), 80);
	});
});
