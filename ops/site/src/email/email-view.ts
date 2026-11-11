/** What the Weekly email page says, kept out of the components so it's tested. */
import type { WeeklyEmailRun, WeeklyEmailSettings, WeeklyEmailStatus } from "./email-api";

/** The email inside its preview frame: links open in a new tab, never inside the frame. */
export function previewDocument(html: string): string {
	const base = '<base target="_blank">';
	return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => `${head}${base}`) : `${base}${html}`;
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
	if (!status.access.mailchimp) return "Mailchimp isn't connected here, so this page is preview only.";
	if (!status.me.email) return "Sign in with Google to send yourself a test.";
	if (!hasEmail) return "There's no email to send yet.";
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
	{ id: "auto", label: "Send automatically" },
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

/** What the settings mean, in a sentence. */
export function settingsLine(settings: WeeklyEmailSettings): string {
	const when = `every ${dayName(settings.day)} at ${settings.time}`;
	if (!settings.sending) return "Off. Nothing is sent to the mailing list.";
	return settings.mode === "approve"
		? `On. A draft is made ${when} and waits for an admin to approve it.`
		: `On. It goes to the mailing list ${when}, by itself.`;
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
				detail: [sentLine(run.sentAt), run.recipients ? `to ${people(run.recipients)}` : ""].filter(Boolean).join(", "),
			};
		case "waiting":
			return {
				label: "Waiting for approval",
				tone: "warning",
				detail: run.recipients ? `Ready to go to ${people(run.recipients)}.` : "Ready to go.",
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
		return { label: "Preview only", tone: "neutral", detail: "Mailchimp isn't connected here, so nothing can be sent." };
	}
	if (!access.audience) {
		return {
			label: "Nothing is sent from here",
			tone: "neutral",
			detail: "Only production ops sends to the mailing list. Here you can look, and send yourself a test.",
		};
	}
	if (!settings.sending) {
		return { label: "Switched off", tone: "neutral", detail: "Nothing is sent to the mailing list until an admin switches it on." };
	}
	if (current) {
		const line = runLine(current);
		if (status.stuck) return { ...line, detail: "It was cut off. It sorts itself out within five minutes." };
		return line;
	}
	if (schedule.state === "due") return { label: "Due now", tone: "info", detail: "It starts within five minutes." };
	if (schedule.state === "missed") {
		return {
			label: "Not sent this week",
			tone: "neutral",
			detail: `This week's time (${whenLine(schedule.scheduled)}) had passed when it was switched on.`,
		};
	}
	return { label: "On", tone: "success", detail: "" };
}

/** "Next one: Mon 16 Nov at 11:00", or why there isn't one. */
export function nextLine(status: WeeklyEmailStatus): string {
	if (!status.access.audience || !status.settings.sending) return "Next one: none while it's off.";
	return `Next one: ${whenLine(status.schedule.next)}.`;
}

/** Why nothing can go to the list from this page at all, or "". Shared by every send button. */
function sendBlocked(status: WeeklyEmailStatus | null): string {
	if (!status) return "Loading…";
	if (!status.access.mailchimp) return "Mailchimp isn't connected here.";
	if (!status.access.audience) return "Only production ops sends to the mailing list.";
	if (!status.me.isAdmin) return "Only admins can send the weekly email.";
	if (!status.settings.sending) return "The weekly email is switched off.";
	return "";
}

/** Why "Approve and send" can't be pressed, or "". */
export function approveBlockedReason(status: WeeklyEmailStatus | null): string {
	return sendBlocked(status) || (status?.current?.status === "waiting" ? "" : "Nothing is waiting for approval.");
}

/** Why "Try again" can't be pressed, or "". It prepares this week's and leaves it waiting. */
export function tryAgainBlockedReason(status: WeeklyEmailStatus | null): string {
	const blocked = sendBlocked(status);
	if (blocked || !status) return blocked;
	const current = status.current;
	if (!current) return status.schedule.state === "missed" ? "" : "This week's hasn't been tried yet.";
	if (current.status === "failed" || current.status === "skipped") return "";
	if (current.status === "sent") return "This week's has been sent.";
	if (current.status === "waiting") return "This week's is ready and waiting.";
	return "This week's is on its way.";
}

/** Why "Send again" can't be pressed, or "". */
export function sendAgainBlockedReason(status: WeeklyEmailStatus | null): string {
	return sendBlocked(status) || (status?.current?.status === "sent" ? "" : "This week's hasn't been sent yet.");
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
