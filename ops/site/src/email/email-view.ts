/** What the Email page says about the monthly what's on, kept out of the components so it's tested. */
import type { WeeklyEmailRun, WeeklyEmailSettings, WeeklyEmailStatus } from "./email-api";

/**
 * The frame's scrollbar, like ops' own (ui/theme/base.css): thin, no arrows,
 * no track, and the thumb only while the pointer is over the email. The frame
 * can't see ops' CSS, so the colour is a fixed muted grey on either theme.
 */
const PREVIEW_SCROLLBAR = `<style data-ops-preview>
html{scrollbar-width:thin;scrollbar-color:transparent transparent}
html:hover{scrollbar-color:rgba(150,150,150,.5) transparent}
::-webkit-scrollbar{width:8px;height:8px;background:transparent}
::-webkit-scrollbar-button{display:none;width:0;height:0}
::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background:transparent}
html:hover::-webkit-scrollbar-thumb{background:rgba(150,150,150,.5)}
</style>`;

/**
 * The email inside its preview frame, as Gmail shows it: Gmail drops the
 * email's <link>s and loads no web fonts, so its faces are the ones on the
 * reader's computer (shared/email/shell.js FONTS). Only Apple Mail loads the
 * website's fonts. Links open in a new tab, never inside the frame.
 */
export function previewDocument(html: string): string {
	const top = `<base target="_blank"><meta http-equiv="Content-Security-Policy" content="font-src 'none'">${PREVIEW_SCROLLBAR}`;
	const email = html.replace(/<link\b[^>]*>/gi, "");
	return /<head[^>]*>/i.test(email) ? email.replace(/<head[^>]*>/i, (head) => `${head}${top}`) : `${top}${email}`;
}

/** "Tue 10 Nov" from 2026-11-10. */
export function shortDay(iso: string): string {
	const [year, month, day] = String(iso).split("-").map(Number);
	if (!year || !month || !day) return "";
	return new Intl.DateTimeFormat("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(year, month - 1, day)));
}

/** What's in it, in a line: "2 nights, 1 deal". */
export function contentsLine(email: { nights: number; deals: number; kitchens: number }): string {
	const count = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : "");
	return (
		[
			count(email.nights, "night", "nights"),
			count(email.deals, "deal", "deals"),
			count(email.kitchens, "pop-up kitchen", "pop-up kitchens"),
		]
			.filter(Boolean)
			.join(", ") || "Nothing on"
	);
}

/** Why "Send me a test" can't be pressed, or "" when it can. */
export function testBlockedReason(
	status: { access: { mailchimp: boolean }; me: { email: string } } | null,
	hasEmail: boolean,
): string {
	if (!status) return "Loading…";
	if (!status.access.mailchimp) return "Mailchimp not connected here";
	if (!status.me.email) return "Sign in with Google first";
	if (!hasEmail) return "No email to send yet";
	return "";
}

export const DAY_OPTIONS = [
	{ value: "mon", label: "Monday" },
	{ value: "tue", label: "Tuesday" },
	{ value: "wed", label: "Wednesday" },
	{ value: "thu", label: "Thursday" },
	{ value: "fri", label: "Friday" },
	{ value: "sat", label: "Saturday" },
	{ value: "sun", label: "Sunday" },
];

export const MODE_OPTIONS = [
	{ id: "auto", label: "Automatic" },
	{ id: "approve", label: "Approve first" },
];

const dayName = (day: string) => DAY_OPTIONS.find((option) => option.value === day)?.label || day;

/** "Mon 16 Nov at 11:00". */
export function whenLine(moment: { date: string; time: string }): string {
	return `${shortDay(moment.date)} at ${moment.time}`;
}

/** "Mon 9 Nov, 11:02" in London, from a stored moment. */
export function sentLine(iso: string | null): string {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return new Intl.DateTimeFormat("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZone: "Europe/London",
	}).format(date);
}

const people = (count: number) => `${count.toLocaleString("en-GB")} ${count === 1 ? "person" : "people"}`;

/** How it goes out: "Automatic", "Approve first", or "Off". */
export function howLine(settings: WeeklyEmailSettings): string {
	if (!settings.sending) return "Off";
	return settings.mode === "approve" ? "Approve first" : "Automatic";
}

/** The settings in a few words: "On · Automatic · Tuesdays 11:45". */
export function settingsLine(settings: WeeklyEmailSettings): string {
	if (!settings.sending) return "Off";
	return ["On", settings.mode === "approve" ? "Approve first" : "Automatic", `first ${dayName(settings.day)} of the month, ${settings.time}`].join(" · ");
}

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

/** One run in a few words: the badge and the line under it. */
export function runLine(run: WeeklyEmailRun): { label: string; tone: StatusTone; detail: string } {
	const again = run.attempt > 1 ? " (sent again)" : "";
	switch (run.status) {
		case "sent":
			return {
				label: `Sent${again}`,
				tone: "success",
				detail: [sentLine(run.sentAt), run.recipients ? people(run.recipients) : ""].filter(Boolean).join(" · "),
			};
		case "waiting":
			return {
				label: "Waiting for approval",
				tone: "warning",
				detail: run.recipients ? `Ready · ${people(run.recipients)}` : "Ready",
			};
		case "sending":
			return { label: "Sending…", tone: "info", detail: "" };
		case "preparing":
			return { label: "Getting ready…", tone: "info", detail: "" };
		case "skipped":
			return { label: "Not sent", tone: "neutral", detail: run.reason };
		default:
			return { label: "Didn't send", tone: "danger", detail: run.reason };
	}
}

/** Where things stand right now, as one plain statement. */
export function statusLine(status: WeeklyEmailStatus): { label: string; tone: StatusTone; detail: string } {
	const { access, settings, schedule, current } = status;
	if (!access.mailchimp) {
		return { label: "Preview only", tone: "neutral", detail: "Mailchimp not connected" };
	}
	if (!access.audience) {
		return {
			label: "Nothing is sent from here",
			tone: "neutral",
			detail: "Production ops only. Tests still work.",
		};
	}
	if (!settings.sending) {
		return { label: "Switched off", tone: "neutral", detail: "" };
	}
	if (current) {
		const line = runLine(current);
		if (status.stuck) return { ...line, detail: "Cut off · sorts itself out within 5 min" };
		return line;
	}
	if (schedule.state === "due") return { label: "Due now", tone: "info", detail: "Starts within 5 min" };
	if (schedule.state === "missed") {
		return {
			label: "Not sent this month",
			tone: "neutral",
			detail: `Switched on after ${whenLine(schedule.scheduled)}`,
		};
	}
	return { label: "On", tone: "success", detail: "" };
}

/** When the next one goes, "Mon 16 Nov at 11:00", or "None" while nothing is sent from here. */
export function nextLine(status: WeeklyEmailStatus): string {
	if (!status.access.audience || !status.settings.sending) return "None";
	return whenLine(status.schedule.next);
}

/** Why nothing can go to the list from this page at all, or "". Shared by every send button. */
function sendBlocked(status: WeeklyEmailStatus | null): string {
	if (!status) return "Loading…";
	if (!status.access.mailchimp) return "Mailchimp isn't connected here.";
	if (!status.access.audience) return "Only production ops sends to the mailing list.";
	if (!status.me.isAdmin) return "Only admins can send the monthly email.";
	if (!status.settings.sending) return "The monthly email is switched off.";
	return "";
}

/** Why "Approve and send" can't be pressed, or "". */
export function approveBlockedReason(status: WeeklyEmailStatus | null): string {
	return sendBlocked(status) || (status?.current?.status === "waiting" ? "" : "Nothing is waiting for approval.");
}

/** Why "Try again" can't be pressed, or "". It prepares this month's and leaves it waiting. */
export function tryAgainBlockedReason(status: WeeklyEmailStatus | null): string {
	const blocked = sendBlocked(status);
	if (blocked || !status) return blocked;
	const current = status.current;
	if (!current) return status.schedule.state === "missed" ? "" : "This month's hasn't been tried yet.";
	if (current.status === "failed" || current.status === "skipped") return "";
	if (current.status === "sent") return "This month's has been sent.";
	if (current.status === "waiting") return "This month's is ready and waiting.";
	return "This month's is on its way.";
}

/** Why "Send again" can't be pressed, or "". */
export function sendAgainBlockedReason(status: WeeklyEmailStatus | null): string {
	return sendBlocked(status) || (status?.current?.status === "sent" ? "" : "This month's hasn't been sent yet.");
}

/** Why the settings can't be changed, or "". */
export function settingsBlockedReason(status: WeeklyEmailStatus | null): string {
	if (!status) return "Loading…";
	return status.me.isAdmin ? "" : "Only admins can change this.";
}

/** The mailing list by size, for a confirmation: "244 people". */
export function audienceLine(memberCount: number): string {
	return people(memberCount);
}

/** A count and its share: "120 · 49%". */
export function countAndRate(count: number, rate: number): string {
	return `${count.toLocaleString("en-GB")} · ${Math.round(rate * 100)}%`;
}

/**
 * An email's lead picture for its card: the first picture after the logo
 * (every email opens with the logo), or "" when it has none.
 */
export function leadPicture(html: string): string {
	const sources = [...String(html || "").matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1].replace(/&amp;/g, "&"));
	return sources[1] || "";
}
