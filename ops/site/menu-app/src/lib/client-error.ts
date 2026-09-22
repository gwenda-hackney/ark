/**
 * Root-level client error reporting for Ops.
 * Render crashes are also handled by <svelte:boundary> in App.svelte.
 */

export type ClientErrorReport = {
	source: string;
	message: string;
	stack: string;
	name: string;
};

export function normalizeClientError(error: unknown): Omit<ClientErrorReport, "source"> {
	if (error instanceof Error) {
		return {
			message: error.message || error.name || "Unknown error",
			stack: error.stack || "",
			name: error.name || "Error",
		};
	}
	if (typeof error === "string" && error.trim()) {
		return { message: error.trim(), stack: "", name: "Error" };
	}
	if (error && typeof error === "object" && "message" in error) {
		const message = String(
			(error as { message?: unknown }).message || "Unknown error",
		);
		const stack =
			"stack" in error
				? String((error as { stack?: unknown }).stack || "")
				: "";
		const name =
			"name" in error
				? String((error as { name?: unknown }).name || "Error")
				: "Error";
		return { message, stack, name };
	}
	try {
		return { message: JSON.stringify(error), stack: "", name: "Error" };
	} catch {
		return { message: "Unknown error", stack: "", name: "Error" };
	}
}

export function reportClientError(
	source: string,
	error: unknown,
): ClientErrorReport {
	const normalized = normalizeClientError(error);
	const report: ClientErrorReport = { source, ...normalized };
	console.error(`[ops] ${source}: ${report.message}`, {
		name: report.name,
		stack: report.stack || undefined,
		error,
	});
	return report;
}

export function installClientErrorHandlers(): void {
	if (typeof window === "undefined") return;
	window.addEventListener("error", (event) => {
		reportClientError("window.error", event.error ?? event.message);
	});
	window.addEventListener("unhandledrejection", (event) => {
		reportClientError("unhandledrejection", event.reason);
	});
}
