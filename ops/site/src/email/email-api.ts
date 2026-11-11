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
