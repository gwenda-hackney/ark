/**
 * "Waiting to show on the website", shared by the menu badge and the Website
 * page. Polls quietly; pages call refreshSitePending() after they change things.
 */
import { getSitePending, type SiteStatus } from "./api";

type State = {
	production: SiteStatus | null;
	preview: SiteStatus | null;
	local: boolean;
	/** This environment's website and preview addresses. */
	urls: { live: string; preview: string };
};

const PROD_URLS = { live: "https://gwenda.co.uk", preview: "https://preview.gwenda-blue.pages.dev" };

let state = $state<State>({ production: null, preview: null, local: false, urls: PROD_URLS });
let timer: ReturnType<typeof setInterval> | null = null;

export function getSitePendingState(): State {
	return state;
}

/** Menu badge: changes the public website does not show yet. */
export function websiteBadge(): { count: number; tone: "waiting" | "updating" | "failed" } | null {
	const live = state.production;
	if (!live || state.local) return null;
	if (live.failed) return { count: live.items.length, tone: "failed" };
	if (!live.items.length) return null;
	return { count: live.items.length, tone: live.updating ? "updating" : "waiting" };
}

export async function refreshSitePending(): Promise<void> {
	try {
		const next = await getSitePending();
		state = {
			production: next.production,
			preview: next.preview,
			local: next.local,
			urls: next.urls || PROD_URLS,
		};
	} catch {
		/* keep the last known state; the badge is a hint */
	}
}

export function startSitePendingPolling(everyMs = 60_000): () => void {
	void refreshSitePending();
	if (!timer) timer = setInterval(() => void refreshSitePending(), everyMs);
	return () => {
		if (timer) clearInterval(timer);
		timer = null;
	};
}
