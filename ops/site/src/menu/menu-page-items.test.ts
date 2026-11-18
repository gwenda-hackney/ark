import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { nameList, sectionRemovalQuestion } from "./menu-page-items";

describe("sectionRemovalQuestion: what Remove section asks", () => {
	const base = { title: "Burgers", groups: [] as string[], deleted: [] as string[], takenOff: [] as string[] };

	it("doesn't ask about an empty section", () => {
		assert.equal(sectionRemovalQuestion(base, "Chez Pickle"), null);
	});

	it("names what goes, what's deleted and what stays", () => {
		assert.deepEqual(
			sectionRemovalQuestion({ ...base, groups: ["Smash"], deleted: ["OG Burger", "Special"], takenOff: ["Fries"] }, "Chez Pickle"),
			{
				title: "Remove Burgers from Chez Pickle?",
				message:
					"Smash goes with it. OG Burger and Special aren't on any other menu, so they're deleted when you save, with their recipes. Fries stays on its other menus. Once saved, this can't be undone.",
				action: "Remove and delete",
			},
		);
		assert.deepEqual(sectionRemovalQuestion({ ...base, takenOff: ["Fries", "Slaw"] }, "Chez Pickle"), {
			title: "Remove Burgers from Chez Pickle?",
			message: "Fries and Slaw stay on their other menus.",
			action: "Remove",
		});
	});
});

describe("nameList", () => {
	it("says a few names, then how many more", () => {
		assert.equal(nameList(["A"]), "A");
		assert.equal(nameList(["A", "B", "C"]), "A, B and C");
		assert.equal(nameList(["A", "B", "C", "D", "E"]), "A, B and 3 more");
	});
});
