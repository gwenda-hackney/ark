import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { WeeklyEmailRun, WeeklyEmailStatus } from "./email-api.ts";
import {
	approveBlockedReason,
	contentsLine,
	nextLine,
	previewDocument,
	runLine,
	sendAgainBlockedReason,
	sentLine,
	settingsBlockedReason,
	settingsLine,
	shortDay,
	statusLine,
	testBlockedReason,
	tryAgainBlockedReason,
} from "./email-view.ts";

describe("weekly email page: the preview", () => {
	it("opens the email's links in a new tab, not inside the frame", () => {
		assert.equal(
			previewDocument('<html><head lang="en"><title>x</title></head><body></body></html>'),
			'<html><head lang="en"><base target="_blank"><title>x</title></head><body></body></html>',
		);
		assert.equal(previewDocument("<p>hi</p>"), '<base target="_blank"><p>hi</p>');
	});

	it("names days the short way", () => {
		assert.equal(shortDay("2026-11-10"), "Tue 10 Nov");
		assert.equal(shortDay(""), "");
	});

	it("says what's in the email", () => {
		assert.equal(contentsLine({ nights: 2, deals: 1, kitchens: 0 }), "2 nights, 1 deal");
		assert.equal(contentsLine({ nights: 1, deals: 0, kitchens: 2 }), "1 night, 2 pop-up kitchens");
		assert.equal(contentsLine({ nights: 0, deals: 0, kitchens: 0 }), "Nothing on");
	});
});

describe("weekly email page: send me a test", () => {
	const status = (mailchimp: boolean, email: string) => ({ access: { mailchimp }, me: { email } });

	it("is always there, with the reason when it can't be pressed", () => {
		assert.equal(testBlockedReason(status(true, "someone@example.com"), true), "");
		assert.match(testBlockedReason(status(false, "someone@example.com"), true), /preview only/);
		assert.match(testBlockedReason(status(true, ""), true), /Sign in with Google/);
		assert.match(testBlockedReason(status(true, "someone@example.com"), false), /no email to send/);
		assert.equal(testBlockedReason(null, true), "Loading…");
	});
});

function run(fields: Partial<WeeklyEmailRun> = {}): WeeklyEmailRun {
	return {
		id: 1,
		weekStart: "2026-11-09",
		attempt: 1,
		status: "sent",
		startedBy: "schedule",
		subject: "This week at Gwenda: Quiz Night",
		preheader: "Thu: Quiz Night",
		recipients: 244,
		reason: "",
		approvedBy: "",
		createdAt: "2026-11-09T11:02:00.000Z",
		updatedAt: "2026-11-09T11:02:00.000Z",
		sentAt: "2026-11-09T11:02:00.000Z",
		campaignUrl: "",
		...fields,
	};
}

/** Production, switched on, an admin looking, nothing started this week. */
function page(fields: Partial<WeeklyEmailStatus> = {}): WeeklyEmailStatus {
	return {
		access: { mailchimp: true, audience: true },
		me: { email: "admin@example.com", isAdmin: true },
		settings: { sending: true, mode: "auto", day: "mon", time: "11:00", notify: [] },
		schedule: {
			week: "2026-11-09",
			state: "before",
			scheduled: { date: "2026-11-09", time: "11:00" },
			next: { date: "2026-11-09", time: "11:00" },
		},
		current: null,
		stuck: false,
		history: [],
		historyProblem: "",
		...fields,
	};
}

describe("weekly email page: status", () => {
	it("says what the settings mean", () => {
		const settings = page().settings;
		assert.equal(settingsLine({ ...settings, sending: false }), "Off. Nothing is sent to the mailing list.");
		assert.equal(settingsLine(settings), "On. It goes to the mailing list every Monday at 11:00, by itself.");
		assert.equal(
			settingsLine({ ...settings, mode: "approve", day: "thu", time: "16:30" }),
			"On. A draft is made every Thursday at 16:30 and waits for an admin to approve it.",
		);
	});

	it("says where a run is, in London time", () => {
		assert.deepEqual(runLine(run()), { label: "Sent", tone: "success", detail: "Mon 9 Nov, 11:02, to 244 people" });
		assert.equal(runLine(run({ attempt: 2 })).label, "Sent (sent again)");
		assert.deepEqual(runLine(run({ status: "waiting", sentAt: null })), {
			label: "Waiting for approval",
			tone: "warning",
			detail: "Ready to go to 244 people.",
		});
		assert.deepEqual(runLine(run({ status: "skipped", reason: "No nights." })), { label: "Not sent", tone: "neutral", detail: "No nights." });
		assert.deepEqual(runLine(run({ status: "failed", reason: "Mailchimp said no." })), {
			label: "Didn't send",
			tone: "danger",
			detail: "Mailchimp said no.",
		});
		// Summer: 10:02 UTC is 11:02 in London.
		assert.equal(sentLine("2026-07-06T10:02:00.000Z"), "Mon 6 Jul, 11:02");
		assert.equal(sentLine(null), "");
	});

	it("says first why nothing is sent from here, then that it's off, then how this week stands", () => {
		assert.equal(statusLine(page({ access: { mailchimp: false, audience: false } })).label, "Preview only");
		assert.equal(statusLine(page({ access: { mailchimp: true, audience: false } })).label, "Nothing is sent from here");
		assert.equal(statusLine(page({ settings: { ...page().settings, sending: false } })).label, "Switched off");
		assert.equal(statusLine(page()).label, "On");
		assert.equal(statusLine(page({ current: run({ status: "waiting" }) })).label, "Waiting for approval");
		assert.match(statusLine(page({ current: run({ status: "sending" }), stuck: true })).detail, /cut off/);
		const missed = page({ schedule: { ...page().schedule, state: "missed", next: { date: "2026-11-16", time: "11:00" } } });
		assert.equal(statusLine(missed).label, "Not sent this week");
		assert.equal(nextLine(missed), "Next one: Mon 16 Nov at 11:00.");
		assert.equal(nextLine(page({ settings: { ...page().settings, sending: false } })), "Next one: none while it's off.");
	});
});

describe("weekly email page: the buttons are always there, with a reason when they can't be pressed", () => {
	const waiting = page({ current: run({ status: "waiting", sentAt: null }) });

	it("Approve and send: an admin, on production, switched on, with a draft waiting", () => {
		assert.equal(approveBlockedReason(waiting), "");
		assert.equal(approveBlockedReason(page()), "Nothing is waiting for approval.");
		assert.equal(approveBlockedReason({ ...waiting, me: { email: "staff@example.com", isAdmin: false } }), "Only admins can send the weekly email.");
		assert.equal(approveBlockedReason({ ...waiting, access: { mailchimp: true, audience: false } }), "Only production ops sends to the mailing list.");
		assert.equal(approveBlockedReason({ ...waiting, access: { mailchimp: false, audience: false } }), "Mailchimp isn't connected here.");
		assert.equal(approveBlockedReason({ ...waiting, settings: { ...waiting.settings, sending: false } }), "The weekly email is switched off.");
		assert.equal(approveBlockedReason(null), "Loading…");
	});

	it("Try again: after a failure, a skipped week, or a missed time", () => {
		assert.equal(tryAgainBlockedReason(page({ current: run({ status: "failed" }) })), "");
		assert.equal(tryAgainBlockedReason(page({ current: run({ status: "skipped" }) })), "");
		assert.equal(tryAgainBlockedReason(page({ schedule: { ...page().schedule, state: "missed" } })), "");
		assert.equal(tryAgainBlockedReason(page()), "This week's hasn't been tried yet.");
		assert.equal(tryAgainBlockedReason(page({ current: run() })), "This week's has been sent.");
		assert.equal(tryAgainBlockedReason(waiting), "This week's is ready and waiting.");
		assert.equal(tryAgainBlockedReason({ ...waiting, access: { mailchimp: true, audience: false } }), "Only production ops sends to the mailing list.");
	});

	it("Send again: only once this week's has gone", () => {
		assert.equal(sendAgainBlockedReason(page({ current: run() })), "");
		assert.equal(sendAgainBlockedReason(waiting), "This week's hasn't been sent yet.");
		assert.equal(sendAgainBlockedReason(page({ current: run(), me: { email: "staff@example.com", isAdmin: false } })), "Only admins can send the weekly email.");
	});

	it("the schedule: admins only", () => {
		assert.equal(settingsBlockedReason(page()), "");
		assert.equal(settingsBlockedReason(page({ me: { email: "staff@example.com", isAdmin: false } })), "Only admins can change this.");
	});
});
