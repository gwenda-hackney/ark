import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildSyncMetrics, healthLabel, healthTone } from "./web-metrics.ts";
import type { WebEnvStatus } from "../app/api.ts";

function env(
	partial: Partial<WebEnvStatus> & { id: WebEnvStatus["id"] },
): WebEnvStatus {
	return {
		id: partial.id,
		label: partial.label || partial.id,
		hosted: partial.hosted ?? true,
		siteUrl: partial.siteUrl ?? null,
		dataset: partial.dataset || partial.id,
		git: partial.git || "main",
		code: {
			commit: null,
			env: null,
			dataset: null,
			error: null,
			...partial.code,
		},
		content: {
			hash: null,
			count: 0,
			updatedAt: null,
			error: null,
			...partial.content,
		},
		health: {
			ok: null,
			down: false,
			lastError: null,
			lastCheckedAt: null,
			...partial.health,
		},
	};
}

describe("buildSyncMetrics", () => {
	it("flags preview ahead with a duration value", () => {
		const metrics = buildSyncMetrics(
			env({
				id: "preview",
				code: { commit: "aaaaaaaa", env: null, dataset: null, error: null },
				content: {
					hash: "hash-a",
					count: 105,
					updatedAt: "2026-09-22T08:44:00.000Z",
					error: null,
				},
			}),
			env({
				id: "production",
				git: "release",
				code: { commit: "aaaaaaaa", env: null, dataset: null, error: null },
				content: {
					hash: "hash-b",
					count: 105,
					updatedAt: "2026-09-21T12:01:00.000Z",
					error: null,
				},
			}),
		);
		assert.equal(metrics[0]?.label, "Preview ahead");
		assert.equal(metrics[0]?.tone, "warn");
		assert.equal(metrics[1]?.value, "105");
		assert.equal(metrics[1]?.tone, "up");
		assert.equal(metrics[2]?.tone, "up");
	});
});

describe("healthLabel", () => {
	it("reads ok and down from the monitor payload", () => {
		assert.equal(
			healthLabel(env({ id: "production", health: { ok: true, down: false, lastError: null, lastCheckedAt: 1 } })),
			"Up",
		);
		assert.equal(
			healthTone(env({ id: "production", health: { ok: false, down: true, lastError: "x", lastCheckedAt: 1 } })),
			"down",
		);
	});
});
