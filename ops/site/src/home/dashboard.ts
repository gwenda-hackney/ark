/**
 * The dashboard's logic, kept out of the component so it can be tested:
 * what needs doing first, tonight's nights, and the cards' one-line states.
 * Data comes from GET /api/dashboard, GET /api/health/errors, and the menu and
 * stock lists for the Drinks card (analysed here, in the browser).
 */
import { analyzeRecipe, summarizeIssues } from "../menu/analyze.ts";
import { formatPourPercent } from "../menu/cost.ts";
import { menuItemPath } from "../app/spa-path.js";
import { type InventoryItem } from "../inventory/types.ts";
import { type MenuItem, type MenuSection, type PourTargetMap } from "../menu/types.ts";
import type {
	DashboardArtists,
	DashboardData,
	DashboardForms,
	DashboardJob,
	DashboardNight,
	DashboardSubmission,
	HealthSite,
	Section,
	WebsiteErrors,
} from "./dashboard-data.ts";

export const SENTRY_ISSUES_URL = "https://gwenda.sentry.io/issues/?query=is%3Aunresolved&statsPeriod=24h";
export const TOP_ROWS = 5;
export const ON_TARGET_BAND = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

export type Tone = "success" | "warning" | "danger" | "muted";

export function plural(count: number, one: string, many = `${one}s`): string {
	return `${count} ${count === 1 ? one : many}`;
}

function sectionData<T>(section: Section<T> | null | undefined): T | null {
	return section && section.ok ? section.data : null;
}

// ─── Needs attention ─────────────────────────────────────────────────────

export type AttentionItem = {
	key: string;
	count: number;
	label: string;
	href: string;
	tone: Tone;
	external?: boolean;
};

export type Attention = {
	items: AttentionItem[];
	/** Nothing to do and every source answered. */
	allClear: boolean;
	/** Sources that are loading or failed, so the page can't say all clear. */
	unknown: string[];
	allClearText: string;
};

/**
 * One line per thing to do, most urgent first. A source that failed or is
 * still loading is listed in `unknown` rather than counted as zero.
 */
export function needsAttention(
	data: DashboardData | null,
	errors: WebsiteErrors | null,
	{ errorsFailed = false }: { errorsFailed?: boolean } = {},
): Attention {
	const items: AttentionItem[] = [];
	const unknown: string[] = [];
	const add = (item: AttentionItem) => {
		if (item.count > 0) items.push(item);
	};

	const health = sectionData(data?.health);
	if (!health) unknown.push("site health");
	else {
		const failing = [health.production, health.preview].filter((site) => site && !site.ok);
		const state = failing.some((site) => site?.down) ? "down" : "failing checks";
		const which =
			failing.length === 1 ? (failing[0]?.id === "preview" ? "preview site" : "site") : "sites";
		add({ key: "site-down", count: failing.length, label: `${which} ${state}`, href: "/web", tone: "danger" });
	}

	const jobs = sectionData(data?.jobs);
	if (!jobs) unknown.push("website jobs");
	else {
		const failed = jobs.jobs.filter((job) => job.state === "failed").length;
		add({ key: "jobs-failed", count: failed, label: failed === 1 ? "event not ready for the website" : "events not ready for the website", href: "/web", tone: "danger" });
	}

	const pending = sectionData(data?.pending);
	if (!pending) unknown.push("website updates");
	else if (pending.production.failed) {
		add({ key: "update-failed", count: 1, label: "website update failed", href: "/web", tone: "danger" });
	}

	if (errorsFailed) unknown.push("errors");
	else if (errors?.configured) {
		add({
			key: "errors-new",
			count: errors.newCount,
			label: errors.newCount === 1 ? "new error" : "new errors",
			href: SENTRY_ISSUES_URL,
			tone: "danger",
			external: true,
		});
	} else if (!errors) unknown.push("errors");

	const forms = sectionData(data?.forms);
	if (!forms) unknown.push("applications");
	else {
		const count = forms.toReview.length;
		add({ key: "applications", count, label: count === 1 ? "application to review" : "applications to review", href: "/forms", tone: "warning" });
	}

	const events = sectionData(data?.events);
	if (!events) unknown.push("events");
	else {
		const count = events.waitingForUpdate.length;
		add({ key: "events-waiting", count, label: count === 1 ? "event waiting for Update website" : "events waiting for Update website", href: "/web", tone: "warning" });
	}

	if (pending && !pending.production.failed) {
		const count = pending.production.count;
		add({ key: "changes-waiting", count, label: count === 1 ? "website change waiting" : "website changes waiting", href: "/web", tone: "warning" });
	}

	const errorsKnown = Boolean(errors?.configured) && !errorsFailed;
	return {
		items,
		allClear: items.length === 0 && unknown.length === 0,
		unknown,
		allClearText: errorsKnown ? "Site up, nothing waiting, no new errors" : "Site up, nothing waiting",
	};
}

// ─── Tonight and the next 7 days ─────────────────────────────────────────

export type NightGroup = { date: string; label: string; tonight: boolean; nights: DashboardNight[] };

function parseIso(iso: string): Date {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

function dayDiff(from: string, to: string): number {
	return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / DAY_MS);
}

export function dayLabel(date: string, today: string): string {
	const diff = dayDiff(today, date);
	if (diff === 0) return "Tonight";
	if (diff === 1) return "Tomorrow";
	return parseIso(date).toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
}

/** Nights by day, tonight first, each day earliest start first. */
export function groupNights(nights: DashboardNight[], today: string): NightGroup[] {
	const sorted = [...nights]
		.filter((night) => night.date >= today)
		.sort(
			(a, b) =>
				a.date.localeCompare(b.date) ||
				(a.startTime || "99").localeCompare(b.startTime || "99") ||
				a.title.localeCompare(b.title),
		);
	const groups = new Map<string, DashboardNight[]>();
	for (const night of sorted) {
		const list = groups.get(night.date) || [];
		list.push(night);
		groups.set(night.date, list);
	}
	return [...groups].map(([date, list]) => ({
		date,
		label: dayLabel(date, today),
		tonight: date === today,
		nights: list,
	}));
}

export function nightTime(night: DashboardNight): string {
	if (night.startTime && night.endTime) return `${night.startTime}–${night.endTime}`;
	return night.startTime || "";
}

/** The night's website state in plain words, job first (it is what happens next). */
export function nightStatus(
	night: DashboardNight,
	jobs: DashboardJob[] | null,
): { label: string; tone: Tone } {
	const job = jobs?.find((row) => row.eventId === night.eventId);
	if (job?.state === "failed") return { label: "Not ready for the website", tone: "danger" };
	if (job?.state === "waiting") return { label: "Getting it ready", tone: "muted" };
	if (night.live === "current") return { label: "On the website", tone: "success" };
	if (night.live === "unpublished") return { label: "Not on the website yet", tone: "warning" };
	return { label: "Waiting for Update website", tone: "warning" };
}

export function nightHref(night: DashboardNight): string {
	return `/events/${encodeURIComponent(night.eventId)}@${night.date}`;
}

// ─── Site health ─────────────────────────────────────────────────────────

export function siteHealthState(site: HealthSite | null): { label: string; tone: Tone } {
	if (!site) return { label: "Not checked", tone: "muted" };
	if (site.down) return { label: "Down", tone: "danger" };
	if (!site.ok || site.checks.some((check) => !check.ok)) return { label: "Failing checks", tone: "danger" };
	return { label: "Up", tone: "success" };
}

export function checkDetail(check: { ok: boolean; status: number | null; error: string }): string {
	if (check.ok) return check.status != null ? String(check.status) : "OK";
	return check.error || (check.status != null ? `HTTP ${check.status}` : "Failed");
}

// ─── Play applications ───────────────────────────────────────────────────

export function ageLabel(iso: string, now = Date.now()): string {
	const time = Date.parse(iso || "");
	if (!Number.isFinite(time)) return "";
	const days = Math.floor((now - time) / DAY_MS);
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	return `${days} days ago`;
}

export type ApplicationsSummary = {
	count: number;
	oldest: string;
	rows: (DashboardSubmission & { age: string })[];
	emailFailed: number;
};

export function applicationsSummary(forms: DashboardForms | null, now = Date.now()): ApplicationsSummary {
	const toReview = [...(forms?.toReview || [])].sort((a, b) =>
		String(a.submittedAt).localeCompare(String(b.submittedAt)),
	);
	return {
		count: toReview.length,
		oldest: toReview.length ? ageLabel(toReview[0].submittedAt, now) : "",
		rows: toReview.slice(0, TOP_ROWS).map((row) => ({ ...row, age: ageLabel(row.submittedAt, now) })),
		emailFailed: forms?.emailFailed.length || 0,
	};
}

// ─── Featured artist ─────────────────────────────────────────────────────

/** The current artist leaves this month and nobody is lined up next. */
export function featuredArtistEnding(artists: DashboardArtists | null, now = new Date()): string | null {
	const current = artists?.current;
	if (!current || artists?.next) return null;
	if (current.endMonth !== String(now.getMonth() + 1)) return null;
	return current.name || "The featured artist";
}

// ─── Drinks with problems ────────────────────────────────────────────────

export type DrinkRow = {
	id: string;
	name: string;
	href: string;
	critical: number;
	warning: number;
	margin: number | null;
	atLoss: boolean;
};

export type DrinksSummary = {
	recipeCount: number;
	critical: number;
	atLoss: number;
	/** Drinks with warnings and nothing worse: behind the "+N warnings" link. */
	warningOnly: number;
	rows: DrinkRow[];
	more: number;
	avgGrossMargin: number | null;
	avgTargetMargin: number | null;
	marginVsTarget: number | null;
};

function flattenSections(sections: MenuSection[] | null | undefined): MenuSection[] {
	return (sections || []).flatMap((section) => [section, ...flattenSections(section.subsections || [])]);
}

export function menuItemsFromSections(sections: MenuSection[] | null | undefined): MenuItem[] {
	return flattenSections(sections).flatMap((section) =>
		(section.items || []).map((row) => ({ ...row, section })),
	);
}

function average(values: number[]): number | null {
	if (!values.length) return null;
	return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
}

/** Gross margin implied by a pour-cost target (20% pour → 80% GM). */
export function targetGrossMargin(pourTarget: number | null | undefined): number | null {
	if (pourTarget == null || !Number.isFinite(pourTarget)) return null;
	return Math.round((100 - pourTarget) * 10) / 10;
}

/**
 * Critical spec problems and drinks sold below cost, worst first. Warnings
 * only get a count: there are dozens and none stops a drink being served.
 */
export function summarizeDrinks(
	items: MenuItem[] | null | undefined,
	inventory: InventoryItem[] | null | undefined,
	targets?: PourTargetMap | null,
): DrinksSummary {
	const recipes = items || [];
	const analysed = recipes.map((item, index) => {
		const analysis = analyzeRecipe(item, inventory, recipes, targets);
		const issues = summarizeIssues(analysis.flags);
		const name = item.name?.trim() || "Untitled";
		const margin = analysis.price.margin;
		return {
			row: {
				id: String(item._id || item.id || `recipe-${index}`),
				name,
				href: item.name?.trim() ? menuItemPath(item.name, "analysis") : "/menu",
				critical: issues.critical,
				warning: issues.warning,
				margin,
				atLoss: margin != null && margin < 0,
			} satisfies DrinkRow,
			pourCost: analysis.price.actualPourCost,
			target: analysis.price.targetPourCost,
		};
	});

	const priced = analysed.filter((entry) => entry.pourCost != null && entry.row.margin != null);
	const avgGrossMargin = average(priced.map((entry) => entry.row.margin || 0));
	const avgTarget = average(priced.map((entry) => entry.target));
	const avgTargetMargin = targetGrossMargin(avgTarget);

	const problems = analysed
		.map((entry) => entry.row)
		.filter((row) => row.critical > 0 || row.atLoss)
		.sort(
			(a, b) =>
				Number(b.atLoss) - Number(a.atLoss) ||
				b.critical - a.critical ||
				(a.margin ?? 0) - (b.margin ?? 0) ||
				a.name.localeCompare(b.name),
		);

	return {
		recipeCount: recipes.length,
		critical: analysed.filter((entry) => entry.row.critical > 0).length,
		atLoss: analysed.filter((entry) => entry.row.atLoss).length,
		warningOnly: analysed.filter((entry) => entry.row.warning > 0 && entry.row.critical === 0 && !entry.row.atLoss)
			.length,
		rows: problems.slice(0, TOP_ROWS),
		more: Math.max(0, problems.length - TOP_ROWS),
		avgGrossMargin,
		avgTargetMargin,
		marginVsTarget:
			avgGrossMargin != null && avgTargetMargin != null
				? Math.round((avgGrossMargin - avgTargetMargin) * 10) / 10
				: null,
	};
}

/** "Average margin 78%, 2% under the 80% target." */
export function marginLine(summary: DrinksSummary): { text: string; tone: Tone } | null {
	const margin = summary.avgGrossMargin;
	const target = summary.avgTargetMargin;
	const delta = summary.marginVsTarget;
	if (margin == null) return null;
	const head = `Average margin ${formatPourPercent(margin)}`;
	if (target == null || delta == null) return { text: `${head}.`, tone: "muted" };
	const targetText = formatPourPercent(target);
	if (Math.abs(delta) <= ON_TARGET_BAND) return { text: `${head}, on the ${targetText} target.`, tone: "success" };
	if (delta > 0) return { text: `${head}, ${formatPourPercent(delta)} above the ${targetText} target.`, tone: "success" };
	return { text: `${head}, ${formatPourPercent(-delta)} under the ${targetText} target.`, tone: "warning" };
}

export function drinkReason(row: DrinkRow): string {
	if (row.atLoss) return `Sold at a loss (${formatPourPercent(row.margin)})`;
	return row.critical === 1 ? "1 critical problem" : `${row.critical} critical problems`;
}

// ─── Website errors ──────────────────────────────────────────────────────

export function relativeTime(iso: string | number | null | undefined, now = Date.now()): string {
	const time = typeof iso === "number" ? iso : Date.parse(iso || "");
	if (!Number.isFinite(time)) return "";
	const minutes = Math.round((now - time) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
	const days = Math.round(hours / 24);
	return days === 1 ? "yesterday" : `${days} days ago`;
}

export function clockTime(value: string | number | null | undefined): string {
	const time = typeof value === "number" ? value : Date.parse(value || "");
	if (!Number.isFinite(time)) return "";
	return new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
