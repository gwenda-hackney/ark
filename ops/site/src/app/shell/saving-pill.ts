/**
 * The shell's saving pill, in words. It follows the background website
 * jobs, and never says "All saved" while an editor has unsaved edits: the
 * same unsaved guard drives the editor's action bar.
 */
export type SavingPill = { tone: "" | "stuck" | "busy" | "done" | "unsaved"; label: string };

export function savingPill({
	stuck,
	busy,
	running,
	recentlyDone,
	dirty,
}: {
	/** Jobs that failed. */
	stuck: number;
	/** Jobs waiting or just queued. */
	busy: number;
	running: boolean;
	/** The last job finished a moment ago. */
	recentlyDone: boolean;
	/** An editor has unsaved edits. */
	dirty: boolean;
}): SavingPill {
	if (stuck) return { tone: "stuck", label: stuck === 1 ? "1 needs a look" : `${stuck} need a look` };
	if (busy || running) {
		return { tone: "busy", label: busy > 1 ? `Getting ${busy} ready…` : "Getting it ready…" };
	}
	if (recentlyDone) return dirty ? { tone: "unsaved", label: "Unsaved changes" } : { tone: "done", label: "All saved" };
	return { tone: "", label: "All saved" };
}
