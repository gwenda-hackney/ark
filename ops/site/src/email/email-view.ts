/** What the Weekly email page says, kept out of the components so it's tested. */

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
export function testBlockedReason(status: { access: { mailchimp: boolean }; me: { email: string } } | null, hasEmail: boolean): string {
	if (!status) return "Loading…";
	if (!status.access.mailchimp) return "Mailchimp isn't connected here, so this page is preview only.";
	if (!status.me.email) return "Sign in with Google to send yourself a test.";
	if (!hasEmail) return "There's no email to send yet.";
	return "";
}
