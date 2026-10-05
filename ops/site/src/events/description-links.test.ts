import { describe, expect, it } from "vitest";
import { descriptionReadout, isShownLink, normalizeDescriptionLink, unshownDescriptionLinks } from "./description-links";

describe("description links", () => {
	it("turns what an editor types into an address the website shows", () => {
		expect(normalizeDescriptionLink("@gwenda.hackney")).toBe("https://www.instagram.com/gwenda.hackney/");
		expect(normalizeDescriptionLink("hi@gwenda.co.uk")).toBe("mailto:hi@gwenda.co.uk");
		expect(normalizeDescriptionLink("+44 20 7123 4567")).toBe("tel:+442071234567");
		expect(normalizeDescriptionLink("dice.fm/event/x")).toBe("https://dice.fm/event/x");
		expect(normalizeDescriptionLink("https://gwenda.co.uk")).toBe("https://gwenda.co.uk");
		expect(normalizeDescriptionLink("/whats-on/chess")).toBe("/whats-on/chess");
	});

	it("refuses anything else", () => {
		expect(normalizeDescriptionLink("javascript:alert(1)")).toBe("");
		expect(normalizeDescriptionLink("ftp://x.co")).toBe("");
		expect(normalizeDescriptionLink("not a link")).toBe("");
		expect(normalizeDescriptionLink("//evil.co")).toBe("");
		expect(isShownLink("data:text/html,x")).toBe(false);
	});

	it("finds links the website wouldn't show", () => {
		expect(unshownDescriptionLinks("[a](https://x.co) [b](javascript:x) \\[c](d)")).toEqual(["javascript:x"]);
	});

	it("reads as text for a night's From series line", () => {
		expect(descriptionReadout("Doors **8pm**, *late*.  \nSee [Gwenda](https://gwenda.co.uk) 2\\*3\n\n- DJs\n- Chess")).toBe(
			"Doors 8pm, late.\nSee Gwenda 2*3\n\n• DJs\n• Chess",
		);
	});
});
