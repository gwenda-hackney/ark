/**
 * Ask before doing something that can't be taken back, in a ConfirmDialog
 * rather than window.confirm. A page keeps one and renders it once:
 *
 *   const confirm = new Confirm();
 *   if (!(await confirm.ask({ title: "Delete Jo?", message: "…", action: "Delete" }))) return;
 *   <ConfirmDialog {confirm} />
 *
 * "Delete" is for things gone for good; "Remove" only takes something off a
 * list (it still exists elsewhere).
 */

export type ConfirmRequest = {
	/** A question naming what goes: "Delete Negroni?". */
	title: string;
	/** What happens, in one line: "It comes off every menu. This can't be undone." */
	message?: string;
	/** The button: "Delete", "Remove", "Decline", "Update website". */
	action: string;
	/** Red for destructive (default), gold for a big but safe step. */
	tone?: "destructive" | "primary";
	cancel?: string;
};

export class Confirm {
	request = $state<ConfirmRequest | null>(null);
	busy = $state(false);
	error = $state("");
	open = $derived(this.request !== null);
	#resolve: ((ok: boolean) => void) | null = null;
	#run: (() => Promise<unknown>) | null = null;

	/** Resolves true when they press the action, false on Cancel, Escape or the backdrop. */
	ask = (request: ConfirmRequest): Promise<boolean> => {
		this.#settle(false);
		this.request = request;
		this.error = "";
		this.busy = false;
		this.#run = null;
		return new Promise((resolve) => {
			this.#resolve = resolve;
		});
	};

	/**
	 * Ask, then run `work` with the dialog open and busy. A failure stays in
	 * the dialog so they can try again or cancel.
	 */
	run = (request: ConfirmRequest, work: () => Promise<unknown>): Promise<boolean> => {
		const asked = this.ask(request);
		this.#run = work;
		return asked;
	};

	accept = async () => {
		if (!this.request || this.busy) return;
		const work = this.#run;
		if (!work) {
			this.#settle(true);
			this.request = null;
			return;
		}
		this.busy = true;
		this.error = "";
		try {
			await work();
			this.#settle(true);
			this.request = null;
		} catch (err) {
			this.error = err instanceof Error ? err.message : "That didn't work. Try again.";
		} finally {
			this.busy = false;
		}
	};

	cancel = () => {
		if (this.busy) return;
		this.#settle(false);
		this.request = null;
	};

	#settle(ok: boolean) {
		const resolve = this.#resolve;
		this.#resolve = null;
		resolve?.(ok);
	}
}
