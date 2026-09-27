/**
 * "Getting it ready for the website": saving only stores the event, and the
 * calendar entries and website copy follow here, in the background. The
 * server works out what is behind (src/features/events/server/website-jobs.js); the open
 * app runs one step per request until nothing is left. A cron does the same
 * when nobody has ops open.
 */
import { getWebsiteJobs, runWebsiteJob, type OpsEvent, type WebsiteJob } from "./api";
import { refreshSitePending } from "./site-pending.svelte";
import { toast } from "./toast.svelte";

type State = {
	jobs: WebsiteJob[];
	/** Saved in this tab and not confirmed ready yet: shown before the list catches up. */
	queued: string[];
	running: boolean;
	/** Finished in this tab, newest first, so the tray can say "done". */
	recent: { eventId: string; name: string; at: string }[];
};

let state = $state<State>({ jobs: [], queued: [], running: false, recent: [] });
const RECENT_LIMIT = 8;

function noteDone(id: string, name: string) {
	state.recent = [
		{ eventId: id, name, at: new Date().toISOString() },
		...state.recent.filter((row) => row.eventId !== id),
	].slice(0, RECENT_LIMIT);
}
let timer: ReturnType<typeof setInterval> | null = null;
const eventListeners = new Set<(event: OpsEvent) => void>();
const idleWaiters: (() => void)[] = [];

/** Safety stop for one run: a long series takes a handful of steps. */
const MAX_STEPS = 40;

export function getWebsiteJobsState(): State {
	return state;
}

/** Where one event stands: "waiting" (being got ready), "failed", or null (ready). */
export function websiteJobFor(id: string | undefined | null): WebsiteJob | { state: "waiting"; error: "" } | null {
	if (!id) return null;
	const job = state.jobs.find((row) => row.eventId === String(id));
	if (job) return job;
	return state.queued.includes(String(id)) ? { state: "waiting", error: "" } : null;
}

/** Hear about events as they come back ready (to refresh an open page). */
export function onWebsiteJobEvent(listener: (event: OpsEvent) => void): () => void {
	eventListeners.add(listener);
	return () => eventListeners.delete(listener);
}

export async function refreshWebsiteJobs(): Promise<void> {
	try {
		const data = await getWebsiteJobs();
		state.jobs = data.jobs || [];
	} catch {
		/* keep the last list; this is a hint */
	}
}

function dequeue(id: string) {
	state.queued = state.queued.filter((row) => row !== id);
}

async function run(): Promise<void> {
	if (state.running) return;
	state.running = true;
	try {
		for (let step = 0; step < MAX_STEPS; step += 1) {
			// Events saved in this tab first, then whatever else is waiting.
			const next = state.queued[0] || "";
			const result = await runWebsiteJob(next);
			if (result.idle) {
				if (!next) break;
				dequeue(next);
				continue;
			}
			const id = String(result.eventId || next);
			if (result.event) for (const listener of eventListeners) listener(result.event);
			for (const warning of result.warnings || []) toast.info(warning);
			if (result.failed) {
				dequeue(id);
				const name = result.event?.name || state.jobs.find((row) => row.eventId === id)?.name || "An event";
				toast.error(`${name} isn't ready for the website: ${result.failed}`);
				// Nothing queued in this tab: stop rather than retry the same failure.
				if (!state.queued.length) break;
			} else if (result.done) {
				dequeue(id);
				noteDone(id, result.event?.name || state.jobs.find((row) => row.eventId === id)?.name || "Event");
			}
		}
	} catch {
		/* offline or signed out: the next poll or the cron picks it up */
	} finally {
		state.running = false;
		await refreshWebsiteJobs();
		void refreshSitePending();
		while (idleWaiters.length) idleWaiters.shift()?.();
	}
}

/** After a save: get this event ready for the website in the background. */
export function queueWebsiteJob(id: string | undefined | null): void {
	if (!id) return;
	const key = String(id);
	if (!state.queued.includes(key)) state.queued = [...state.queued, key];
	void run();
}

/** "Try again" on a failed event. */
export async function retryWebsiteJob(id: string): Promise<void> {
	const result = await runWebsiteJob(id, { retry: true });
	if (result.event) for (const listener of eventListeners) listener(result.event);
	if (result.failed) throw new Error(result.failed);
	if (!result.done) queueWebsiteJob(id);
	await refreshWebsiteJobs();
}

/** Resolves once this tab has nothing left to do for `id` (before "Update website"). */
export async function websiteJobSettled(id: string): Promise<void> {
	for (let i = 0; i < MAX_STEPS && websiteJobFor(id)?.state === "waiting"; i += 1) {
		if (!state.running) queueWebsiteJob(id);
		await new Promise<void>((resolve) => idleWaiters.push(resolve));
	}
}

/** Keep the list fresh and carry on with anything left waiting. */
export function startWebsiteJobs(everyMs = 60_000): () => void {
	const tick = async () => {
		await refreshWebsiteJobs();
		if (state.jobs.some((job) => job.state === "waiting")) void run();
	};
	void tick();
	if (!timer) timer = setInterval(() => void tick(), everyMs);
	return () => {
		if (timer) clearInterval(timer);
		timer = null;
	};
}
