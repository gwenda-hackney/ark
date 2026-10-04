/** What GET /api/dashboard and GET /api/health/errors answer (src/home/server/dashboard.js). */

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

export type DashboardNight = {
	eventId: string;
	date: string;
	title: string;
	artist: string;
	startTime: string;
	endTime: string;
	live: "current" | "stale" | "unpublished" | string;
	preview: "current" | "stale" | "unpublished" | string;
	/** The series' upcoming nights missing from Google Calendar or out of date. */
	calendarBehind: number;
};

export type DashboardEvents = {
	today: string;
	days: number;
	nights: DashboardNight[];
	waitingForUpdate: { id: string; name: string; change: "added" | "changed" }[];
};

export type DashboardJob = {
	eventId: string;
	name: string;
	state: "waiting" | "failed";
	error: string;
	failedAt: string | null;
};

export type DashboardSite = {
	known: boolean;
	builtAt: string | null;
	count: number;
	items: { label: string; change: string }[];
	updating: boolean;
	runUrl: string;
	failed: boolean;
	needsHelp: boolean;
	lastError: string;
	autoUpdateAt: string | null;
};

export type DashboardPending = {
	local: boolean;
	urls: { live: string; preview: string };
	production: DashboardSite;
	preview: DashboardSite;
};

export type HealthCheck = { name: string; ok: boolean; status: number | null; error: string };

export type HealthSite = {
	id: "production" | "preview";
	url: string;
	ok: boolean;
	down: boolean;
	consecutiveFails: number;
	/** Epoch ms from the site-health Worker. */
	lastCheckedAt: number | string | null;
	lastError: string;
	checks: HealthCheck[];
};

export type DashboardHealth = {
	production: HealthSite | null;
	preview: HealthSite | null;
};

export type DashboardSubmission = {
	id: string;
	name: string;
	email: string;
	formSlug: string;
	formTitle: string;
	submittedAt: string;
	decision: string;
	notifySentAt: string;
	receiptSentAt: string;
};

export type DashboardForms = {
	toReview: DashboardSubmission[];
	emailFailed: DashboardSubmission[];
};

export type DashboardArtist = { id: string; name: string; startMonth: string; endMonth: string };

export type DashboardArtists = { current: DashboardArtist | null; next: DashboardArtist | null };

export type DashboardData = {
	ok: boolean;
	checkedAt: string;
	events: Section<DashboardEvents>;
	jobs: Section<{ jobs: DashboardJob[] }>;
	pending: Section<DashboardPending>;
	health: Section<DashboardHealth>;
	forms: Section<DashboardForms>;
	artists: Section<DashboardArtists>;
};

export type SentryIssue = {
	id: string;
	shortId: string;
	title: string;
	project: string;
	count: number;
	lastSeen: string | null;
	firstSeen: string | null;
	link: string;
	isNew: boolean;
};

export type WebsiteErrors =
	| { configured: false }
	| {
			configured: true;
			period: string;
			total: number;
			capped: boolean;
			events: number;
			newCount: number;
			issues: SentryIssue[];
			checkedAt: string;
	  };
