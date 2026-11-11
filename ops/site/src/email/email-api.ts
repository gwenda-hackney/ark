/** The weekly email's API, as the page calls it (functions/api/email). */
import { request } from "../app/api";

export type WeeklyEmailPreview = {
	/** The day it's built for, in London: 2026-11-10. */
	today: string;
	/** The Monday of that week. */
	weekStart: string;
	week: { start: string; end: string; span: string };
	/** No nights this week: it wouldn't be sent. */
	empty: boolean;
	emptyReason: string;
	nights: number;
	deals: number;
	kitchens: number;
	subject: string;
	preheader: string;
	html: string;
	/** The website its links and logo point at. */
	origin: string;
};

export function getWeeklyEmailPreview() {
	return request<{ email: WeeklyEmailPreview | null; problem: string }>("/api/email/preview");
}

export type WeeklyEmailAccess = {
	/** Mailchimp is connected here: tests to yourself work. */
	mailchimp: boolean;
	/** This is production ops with Mailchimp: the only place the list can be sent to. */
	audience: boolean;
};

export type WeeklyEmailSettings = {
	/** The switch: nothing goes to the list unless this is on (production only). */
	sending: boolean;
	/** auto: it sends by itself at its time. approve: it waits for an admin. */
	mode: "auto" | "approve";
	day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
	/** London, HH:MM. */
	time: string;
	/** Who's told when one waits or fails; the admins when empty. */
	notify: string[];
};

export type WeeklyEmailRun = {
	id: number;
	/** The Monday of its week. */
	weekStart: string;
	/** 1 is the week's own; 2 and up were sent again by an admin. */
	attempt: number;
	status: "preparing" | "waiting" | "sending" | "sent" | "skipped" | "failed";
	startedBy: "schedule" | "manual";
	subject: string;
	preheader: string;
	recipients: number;
	/** Why it was skipped, or what failed. */
	reason: string;
	approvedBy: string;
	createdAt: string;
	updatedAt: string;
	sentAt: string | null;
	/** The campaign in Mailchimp; "" before there is one. */
	campaignUrl: string;
};

export type WeeklyEmailSchedule = {
	week: string;
	state: "before" | "due" | "missed";
	scheduled: { date: string; time: string };
	next: { date: string; time: string };
};

export type WeeklyEmailStatus = {
	access: WeeklyEmailAccess;
	me: { email: string; isAdmin: boolean };
	settings: WeeklyEmailSettings;
	schedule: WeeklyEmailSchedule;
	/** This week's email, when it has been started. */
	current: WeeklyEmailRun | null;
	/** It was cut off mid-step; the next scheduler pass sorts it out. */
	stuck: boolean;
	history: WeeklyEmailRun[];
	historyProblem: string;
};

export function getWeeklyEmailStatus() {
	return request<WeeklyEmailStatus>("/api/email/status");
}

export function sendWeeklyEmailTest() {
	return request<{ sentTo: string; subject: string; warning: string }>("/api/email/test", { method: "POST" });
}

const post = (body: unknown): RequestInit => ({
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(body),
});

export function saveWeeklyEmailSettings(settings: Partial<WeeklyEmailSettings>) {
	return request<{ settings: WeeklyEmailSettings }>("/api/email/settings", post(settings));
}

/** How many people are on the mailing list (admins). */
export function getWeeklyEmailAudience() {
	return request<{ audience: { name: string; memberCount: number } }>("/api/email/audience");
}

export function approveWeeklyEmail() {
	return request<WeeklyEmailStatus>("/api/email/approve", post({ confirm: "send" }));
}

export function prepareWeeklyEmail() {
	return request<WeeklyEmailStatus>("/api/email/prepare", post({}));
}

export function sendWeeklyEmailAgain(after: number) {
	return request<WeeklyEmailStatus>("/api/email/send-again", post({ confirm: "send-again", after }));
}
