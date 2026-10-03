import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { menuItemPayload } from "./item-payload";

describe("menuItemPayload", () => {
	it("sends each channel's placement as it is (#151)", () => {
		const placements = [
			{ channel: "print" as const, sectionId: "1" },
			{ channel: "digital" as const, sectionId: "2" },
		];
		const payload = menuItemPayload({ name: "Negroni", sectionId: "1", placements });
		assert.deepEqual(payload.placements, placements);
	});

	it("leaves placements out for a new drink that has none yet, so the server fills them from the section", () => {
		const payload = menuItemPayload({ name: "Negroni", sectionId: "1" });
		assert.equal("placements" in payload, false);
	});
});
