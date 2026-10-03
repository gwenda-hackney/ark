import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** Every confirm is a ConfirmDialog: native dialogs can't be styled, read badly on phones and block the page. */
const SRC = join(import.meta.dirname, "..");

function files(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "node_modules" ? [] : files(path);
		return /\.(svelte|ts|js)$/.test(entry.name) && !/\.test\.(ts|js)$/.test(entry.name) ? [path] : [];
	});
}

describe("confirms", () => {
	it("never use window.confirm, alert or prompt in the app", () => {
		const offenders = files(SRC).filter((path) => {
			const text = readFileSync(path, "utf8");
			return /\bwindow\.(confirm|alert|prompt)\s*\(|(^|[^.\w])(confirm|alert|prompt)\s*\(\s*["'`]/m.test(text);
		});
		expect(offenders.map((path) => relative(SRC, path))).toEqual([]);
	});
});
