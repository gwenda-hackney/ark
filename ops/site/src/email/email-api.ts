/** The Email page's API, as the page calls it (functions/api/email). */
import { request } from "../app/api";

export type WeeklyEmailPreview = {
	/** The day it's built for, in London: 2026-11-10. */
	today: string;
	/** The first day of its month. */
	monthStart: string;
	month: { start: string; end: string; name: string; span: string };
	/** No nights left this month: it wouldn't be sent. */
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
	/** The first day of its month. */
	monthStart: string;
	/** 1 is the month's own; 2 and up were sent again by an admin. */
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
	month: string;
	state: "before" | "due" | "missed";
	scheduled: { date: string; time: string };
	next: { date: string; time: string };
};

export type WeeklyEmailStatus = {
	access: WeeklyEmailAccess;
	me: { email: string; isAdmin: boolean };
	settings: WeeklyEmailSettings;
	schedule: WeeklyEmailSchedule;
	/** This month's email, when it has been started. */
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

/** One email sent to the list, with Mailchimp's numbers. Rates are 0 to 1. */
export type SentEmailReport = {
	id: string;
	subject: string;
	sentAt: string;
	emailsSent: number;
	opens: number;
	openRate: number;
	clicks: number;
	clickRate: number;
	unsubscribed: number;
	bounces: number;
};

/** Every email sent to the mailing list, newest first. */
export function getSentEmailReports() {
	return request<{ reports: SentEmailReport[] }>("/api/email/reports");
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

// ------------------------------------------------------- one-off emails (#348)

/** A part of a one-off email, between its fixed logo and foot (shared/email/sections.js). */
/** An Event card: a night (with its date) or a deal or pop-up kitchen (with its tag). */
export type EventCard = {
	kind: "event";
	eventId: string;
	date: string;
	tag: string;
	title: string;
	when: string;
	note: string;
	link: string;
	assetId: string;
};

/** One thing an Event card can show, from GET /api/email/cards. */
export type EventCardChoice = { id: string; group: string; label: string; detail: string; card: EventCard };

/** What Event cards can show now: nights to come, then deals and pop-up kitchens. */
export function getEventCards() {
	return request<{ choices: EventCardChoice[] }>("/api/email/cards");
}

/** One cell of a Row: a picture, our logo, a ×, or nothing yet. */
export type RowCell = { kind: "picture"; assetId: string; alt: string } | { kind: "logo" } | { kind: "times" } | { kind: "empty" };

export type OneOffSection =
	| { kind: "image"; assetId: string; alt: string; size: ImageSize }
	/** Two or three cells side by side: pictures, our logo, a ×. */
	| { kind: "row"; cells: RowCell[] }
	/** The monthly email's dashed line. */
	| { kind: "divider" }
	/** A night, deal or pop-up kitchen, as the monthly email draws it, in the words it had when picked. */
	| EventCard
	| { kind: "heading"; text: string }
	| { kind: "copy"; text: string }
	| { kind: "button"; label: string; link: string; look: ButtonLook }
	/** Book a table: always the same, to the site's booking page. */
	| { kind: "booking" };

/** Link: underlined gold capitals, as the website's. Outline: a gold frame. Book a table has its own section. */
/** An Image section's size: the column's width; small and whole, as a logo; or "GWENDA ×" and the logo. */
export type ImageSize = "full" | "logo" | "collab";
export type ButtonLook = "link" | "outline";

export type OneOffStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

export type OneOffEmail = {
	id: number;
	/** What ops calls it, on its card and in the editor; the list never sees it. */
	name: string;
	subject: string;
	previewText: string;
	sections: OneOffSection[];
	status: OneOffStatus;
	recipients: number;
	reason: string;
	createdBy: string;
	updatedBy: string;
	createdAt: string;
	updatedAt: string;
	scheduledFor: string | null;
	sentAt: string | null;
};

export type OneOffSummary = OneOffEmail & { sectionCount: number };

/** Where the email is sent from: its website, the Sanity project its pictures are in, the logo. */
export type EmailFrame = {
	site: {
		origin: string;
		name: string;
		social: string;
		instagram: string;
		whatsOn: string;
		mapsUrl: string;
		address: string;
	};
	images: { projectId: string; dataset: string };
	logoUrl?: string;
};

export type OneOffContext = { frame: EmailFrame; access: WeeklyEmailAccess };

export function listOneOffEmails() {
	return request<{ emails: OneOffSummary[] } & OneOffContext>("/api/email/one-off");
}

export function getOneOffEmail(id: number | string) {
	return request<{ email: OneOffEmail } & OneOffContext>(`/api/email/one-off/${encodeURIComponent(String(id))}`);
}

export type OneOffDraft = Pick<OneOffEmail, "name" | "subject" | "previewText" | "sections">;

export function createOneOffEmail(draft: OneOffDraft) {
	return request<{ email: OneOffEmail }>("/api/email/one-off", post(draft));
}

export function saveOneOffEmail(id: number, draft: OneOffDraft) {
	return request<{ email: OneOffEmail }>(`/api/email/one-off/${id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(draft),
	});
}

export function deleteOneOffEmail(id: number) {
	return request<{ deleted: boolean }>(`/api/email/one-off/${id}`, { method: "DELETE" });
}

export function sendOneOffTest(id: number) {
	return request<{ sentTo: string; subject: string; warning: string }>(`/api/email/one-off/${id}/test`, {
		method: "POST",
	});
}

/** Send to the list (admins, production only): the saved email to everyone on the mailing list, now. */
export function sendOneOffToList(id: number) {
	return request<{ email: OneOffEmail }>(`/api/email/one-off/${id}/send`, post({ confirm: "send" }));
}

/** A picture for an Image section: uploaded to Sanity. */
export function uploadEmailImage(file: File) {
	const body = new FormData();
	body.set("file", file);
	return request<{ assetId: string; url: string }>("/api/email/images", { method: "POST", body });
}

/** Something an email can promote (#348): a template, and what it can promote now. */
export type PromoteTemplate = {
	id: string;
	label: string;
	choices: Array<{ id: string; name: string; when: string }>;
};

export function getPromoteChoices() {
	return request<{ templates: PromoteTemplate[] }>("/api/email/promote");
}

/** A draft built from a template for one thing, saved, to open in the editor. */
export function promoteInEmail(template: string, id: string) {
	return request<{ email: OneOffEmail }>("/api/email/promote", post({ template, id }));
}
