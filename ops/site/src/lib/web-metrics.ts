import type { WebEnvStatus } from "./api";

export type MetricTone = "up" | "warn" | "down" | "muted";

export type SyncMetric = {
	label: string;
	value: string;
	tone: MetricTone;
	title: string;
};

export function shortCommit(commit: string | null | undefined): string {
	if (!commit) return "Unknown";
	return commit.slice(0, 7);
}

export function formatWhen(value: string | number | null | undefined): string {
	if (!value) return "Unknown";
	try {
		return new Date(value).toLocaleString("en-GB", {
			dateStyle: "medium",
			timeStyle: "short",
		});
	} catch {
		return String(value);
	}
}

export function durationLabel(ms: number): string | null {
	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;
	if (ms < minute) return null;
	if (ms < hour) {
		const n = Math.max(1, Math.round(ms / minute));
		return n === 1 ? "1 min" : `${n} min`;
	}
	if (ms < day) {
		const n = Math.max(1, Math.round(ms / hour));
		return n === 1 ? "1 hour" : `${n} hours`;
	}
	const n = Math.max(1, Math.round(ms / day));
	return n === 1 ? "1 day" : `${n} days`;
}

export function updatedGap(
	previewAt: string | null,
	productionAt: string | null,
): string | null {
	if (!previewAt || !productionAt) return null;
	const delta = new Date(previewAt).getTime() - new Date(productionAt).getTime();
	if (!Number.isFinite(delta)) return null;
	return durationLabel(Math.abs(delta));
}

export function buildSyncMetrics(
	preview: WebEnvStatus,
	production: WebEnvStatus,
): SyncMetric[] {
	const left = preview.content;
	const right = production.content;
	const contentTitle = `Preview updated ${formatWhen(left.updatedAt)}. Production updated ${formatWhen(right.updatedAt)}.`;
	let content: SyncMetric;
	if (left.error || right.error) {
		content = {
			label: "Content",
			value: "Error",
			tone: "down",
			title: left.error || right.error || "Could not read content.",
		};
	} else if (!left.hash || !right.hash) {
		content = {
			label: "Content",
			value: "Unknown",
			tone: "muted",
			title: "Could not read one of the datasets.",
		};
	} else if (left.hash === right.hash) {
		content = {
			label: "Content",
			value: "Same",
			tone: "up",
			title: contentTitle,
		};
	} else {
		const leftAt = left.updatedAt ? new Date(left.updatedAt).getTime() : Number.NaN;
		const rightAt = right.updatedAt ? new Date(right.updatedAt).getTime() : Number.NaN;
		const previewNewer = leftAt > rightAt;
		const productionNewer =
			Number.isFinite(leftAt) && Number.isFinite(rightAt) && leftAt < rightAt;
		content = {
			label: previewNewer
				? "Preview ahead"
				: productionNewer
					? "Production ahead"
					: "Revisions differ",
			value: updatedGap(left.updatedAt, right.updatedAt) ?? "Differs",
			tone: "warn",
			title: contentTitle,
		};
	}

	const sameCount = left.count === right.count;
	const documents: SyncMetric = {
		label: "Documents",
		value: sameCount ? String(left.count) : `${left.count} / ${right.count}`,
		tone: sameCount ? "up" : "warn",
		title: sameCount
			? `${left.count} documents on both sites.`
			: `Preview ${left.count}. Production ${right.count}.`,
	};

	const previewCommit = preview.code.commit;
	const productionCommit = production.code.commit;
	let code: SyncMetric;
	if (preview.code.error || production.code.error) {
		code = {
			label: "Code",
			value: "Error",
			tone: "down",
			title: preview.code.error || production.code.error || "Could not read code.",
		};
	} else if (!previewCommit || !productionCommit) {
		code = {
			label: "Code",
			value: "Unknown",
			tone: "muted",
			title: "Could not read one of the commits.",
		};
	} else if (previewCommit === productionCommit) {
		code = {
			label: "Code",
			value: shortCommit(previewCommit),
			tone: "up",
			title: "Same commit on preview and production.",
		};
	} else {
		code = {
			label: "Code",
			value: "Differs",
			tone: "warn",
			title: `Preview ${shortCommit(previewCommit)}. Production ${shortCommit(productionCommit)}.`,
		};
	}

	return [content, documents, code];
}

export function healthTone(env: WebEnvStatus | null | undefined): MetricTone {
	if (!env?.hosted) return "muted";
	if (env.health.down || env.health.ok === false) return "down";
	if (env.health.ok === true) return "up";
	return "muted";
}

export function healthLabel(env: WebEnvStatus | null | undefined): string {
	const tone = healthTone(env);
	if (tone === "down") return "Down";
	if (tone === "up") return "Up";
	if (env && !env.hosted) return "Local";
	return "Unknown";
}

export function siteHost(url: string | null | undefined): string {
	if (!url) return "";
	return url.replace(/^https:\/\//, "");
}
