/**
 * App-wide toasts. BusyOverlay covers in-flight work; toasts report outcomes.
 */
export type ToastKind = "ok" | "error" | "info";

export type Toast = {
	id: number;
	message: string;
	kind: ToastKind;
	ttlMs: number;
};

let seq = 0;
let items = $state<Toast[]>([]);

export function getToasts(): Toast[] {
	return items;
}

function push(message: string, kind: ToastKind, ttlMs = 4200) {
	const text = String(message || "").trim();
	if (!text) return;
	const id = ++seq;
	items = [...items, { id, message: text, kind, ttlMs }];
	if (ttlMs > 0) {
		window.setTimeout(() => dismiss(id), ttlMs);
	}
}

export function dismiss(id: number) {
	items = items.filter((t) => t.id !== id);
}

export const toast = {
	ok: (message: string, ttlMs?: number) => push(message, "ok", ttlMs),
	error: (message: string, ttlMs?: number) => push(message, "error", ttlMs ?? 6500),
	info: (message: string, ttlMs?: number) => push(message, "info", ttlMs),
};
