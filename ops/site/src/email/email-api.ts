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

export type WeeklyEmailStatus = {
	access: WeeklyEmailAccess;
	me: { email: string; isAdmin: boolean };
};

export function getWeeklyEmailStatus() {
	return request<WeeklyEmailStatus>("/api/email/status");
}

export function sendWeeklyEmailTest() {
	return request<{ sentTo: string; subject: string; warning: string }>("/api/email/test", { method: "POST" });
}
