/**
 * The item editor on a menu's page: click an item and its row opens into
 * name, line and price right where it sits; Add item opens an empty one at
 * the foot of its section. One is open at a time. Opening another while
 * the open one has changes asks first (`ask`), so nothing typed is lost
 * without a word; Cancel or Esc closes it as it was.
 */
import { cleanPrice } from "./menu-page-items";

export type ItemDraft = { name: string; description: string; price: string };

/** What the editor is open on: an item, or a new one in a section. */
export type ItemEditTarget = { kind: "item"; id: string; label: string } | { kind: "new"; sectionId: string; label: string };

const EMPTY: ItemDraft = { name: "", description: "", price: "" };

function same(a: ItemDraft, b: ItemDraft): boolean {
	return a.name.trim() === b.name.trim() && a.description.trim() === b.description.trim() && a.price.trim() === b.price.trim();
}

/** Why the draft can't be saved, or "" when it can. */
export function itemDraftProblem(draft: ItemDraft): string {
	if (!draft.name.trim()) return "Give it a name.";
	if (draft.price.trim() && !cleanPrice(draft.price)) return "The price isn't a number.";
	return "";
}

export class InlineItemEditor {
	target = $state<ItemEditTarget | null>(null);
	draft = $state<ItemDraft>({ ...EMPTY });
	saving = $state(false);
	#initial = $state<ItemDraft>({ ...EMPTY });
	dirty = $derived(this.target !== null && !same(this.draft, this.#initial));

	/** Asked before the open item's changes are dropped; resolves true to drop them. */
	#ask: (label: string) => Promise<boolean>;

	constructor(ask: (label: string) => Promise<boolean>) {
		this.#ask = ask;
	}

	isOpen(id: string): boolean {
		return this.target?.kind === "item" && this.target.id === id;
	}

	isAdding(sectionId: string): boolean {
		return this.target?.kind === "new" && this.target.sectionId === sectionId;
	}

	/** Open the editor on `target` with `draft`. False when the open one keeps its changes. */
	async open(target: ItemEditTarget, draft: ItemDraft = EMPTY): Promise<boolean> {
		const current = this.target;
		if (current && current.kind === target.kind && (current.kind === "item" ? current.id === (target as { id: string }).id : current.sectionId === (target as { sectionId: string }).sectionId)) {
			return true;
		}
		if (this.saving) return false;
		if (this.dirty && current && !(await this.#ask(current.label))) return false;
		this.target = target;
		this.draft = { ...draft };
		this.#initial = { ...draft };
		return true;
	}

	/** Close it as it was. */
	cancel() {
		if (this.saving) return;
		this.target = null;
		this.draft = { ...EMPTY };
		this.#initial = { ...EMPTY };
	}

	/**
	 * Save with `work` (the page's save path for this target). Returns the
	 * problem when the draft can't be saved; the editor closes once it is.
	 * A failed save keeps it open with what was typed, and throws.
	 */
	async save(work: (target: ItemEditTarget, draft: ItemDraft) => Promise<void>): Promise<string> {
		const target = this.target;
		if (!target || this.saving) return "";
		const problem = itemDraftProblem(this.draft);
		if (problem) return problem;
		this.saving = true;
		try {
			await work(target, { ...this.draft });
		} finally {
			this.saving = false;
		}
		this.cancel();
		return "";
	}
}
