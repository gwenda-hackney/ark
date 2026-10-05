import {
	getEventInstagram,
	getInstagramStatus,
	postEventInstagram,
	type InstagramDraft,
	type InstagramPost,
	type InstagramSetup,
	type InstagramStatus,
} from "../app/api";
import { toast } from "../ui/toast.svelte";

/** Characters as Instagram counts them (an emoji is one). */
export function captionLength(caption: string): number {
	return [...caption].length;
}

/** "5 Oct, 18:02" in London time. */
export function postedLabel(iso: string): string {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
	const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
	return `${day}, ${time}`;
}

/** Why Post can't be pressed now, in plain words; "" when it can. */
export function postBlocker(input: {
	draft: InstagramDraft | null;
	setup: InstagramSetup | null;
	caption: string;
	busy: boolean;
}): string {
	const { draft, setup, caption, busy } = input;
	if (!setup?.ready) return setup?.message || "Instagram isn't set up in this environment yet.";
	if (!draft) return "Loading…";
	if (busy) return "Working…";
	if (draft.posting) return "A post for this is on its way. Wait a minute, then reload.";
	if (draft.imageProblem) return draft.imageProblem;
	if (!draft.live) return "Update website first";
	if (!caption.trim()) return "Write a caption first";
	if (captionLength(caption) > draft.captionLimit) return "The caption is too long";
	return "";
}

/** Why Check can't be pressed now; it works before the website is updated. */
export function checkBlocker(input: {
	draft: InstagramDraft | null;
	setup: InstagramSetup | null;
	caption: string;
	busy: boolean;
}): string {
	const { draft, setup, caption, busy } = input;
	if (!setup?.ready) return setup?.message || "Instagram isn't set up in this environment yet.";
	if (!draft) return "Loading…";
	if (busy) return "Working…";
	if (setup.mode === "dry-run") return "Nothing is sent from here, so there is nothing to check";
	if (draft.imageProblem) return draft.imageProblem;
	if (!caption.trim()) return "Write a caption first";
	if (captionLength(caption) > draft.captionLimit) return "The caption is too long";
	return "";
}

/**
 * The Instagram tab of an event or a night (#26). The page keeps one for the
 * editor, so switching tabs keeps the caption being written.
 */
export class EventInstagram {
	draft = $state<InstagramDraft | null>(null);
	setup = $state<InstagramSetup | null>(null);
	status = $state<InstagramStatus | null>(null);
	caption = $state("");
	loading = $state(false);
	posting = $state(false);
	checking = $state(false);
	error = $state("");
	/** The outcome of the last Check or Post, shown under the buttons. */
	notice = $state("");
	noticeTone = $state<"ok" | "info" | "error">("info");
	busy = $derived(this.posting || this.checking);
	private loadedFor = "";

	/** Loads once per event and night (again when `force`). Keeps a caption being written. */
	async load(eventId: string, date = "", force = false) {
		if (!eventId) return;
		const key = `${eventId}@${date}`;
		if (!force && this.loadedFor === key && !this.error) return;
		const fresh = this.loadedFor !== key;
		this.loading = true;
		this.error = "";
		if (fresh) {
			this.notice = "";
			this.draft = null;
		}
		try {
			const [data] = await Promise.all([getEventInstagram(eventId, date), this.loadStatus()]);
			this.draft = data.draft;
			this.setup = data.setup;
			if (fresh || !this.caption.trim()) this.caption = data.draft.caption;
			this.loadedFor = key;
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Could not load Instagram.";
		} finally {
			this.loading = false;
		}
	}

	private async loadStatus() {
		if (this.status) return;
		this.status = await getInstagramStatus().catch(() => null);
	}

	/** Back to the caption ops would write. */
	resetCaption() {
		if (this.draft) this.caption = this.draft.caption;
	}

	async check(eventId: string) {
		if (this.busy || !this.draft) return;
		this.checking = true;
		this.notice = "";
		try {
			const result = await postEventInstagram(eventId, { date: this.draft.date, caption: this.caption, check: true });
			this.noticeTone = "ok";
			this.notice = result.checked
				? `Instagram accepted the image and caption for @${result.account?.username || "the account"}. Nothing was posted.`
				: "Nothing is sent from here, so there was nothing to check.";
		} catch (err) {
			this.noticeTone = "error";
			this.notice = err instanceof Error ? err.message : "Could not check with Instagram.";
		} finally {
			this.checking = false;
		}
	}

	/** Post now. `again` confirms posting something already posted. */
	async post(eventId: string, again = false) {
		if (this.busy || !this.draft) return;
		const { date } = this.draft;
		this.posting = true;
		this.notice = "";
		try {
			const result = await postEventInstagram(eventId, { date, caption: this.caption, again });
			if (result.dryRun) {
				this.noticeTone = "info";
				this.notice = "Dry run: nothing was sent to Instagram from here.";
			} else if (result.pending) {
				this.noticeTone = "info";
				this.notice = result.message || "Instagram is still preparing the image.";
			} else {
				this.noticeTone = "ok";
				this.notice = "";
				toast.ok("Posted to Instagram.");
			}
			await this.load(eventId, date, true);
		} catch (err) {
			this.noticeTone = "error";
			this.notice = err instanceof Error ? err.message : "Could not post to Instagram.";
			await this.load(eventId, date, true);
		} finally {
			this.posting = false;
		}
	}

	get lastPosted(): InstagramPost | null {
		return this.draft?.lastPosted || null;
	}
}
