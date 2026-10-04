import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import FieldHarness from "./fixtures/FieldHarness.svelte";

function html(props: Record<string, unknown>) {
	return render(FieldHarness, { props }).body;
}

function inputTag(body: string): string {
	return /<input[^>]*id="f-x"[^>]*>/.exec(body)?.[0] || "";
}

describe("Field", () => {
	it("points the control at its hint", () => {
		const body = html({ hint: "What guests pay." });
		expect(body).toContain('id="f-x-hint"');
		expect(body).toContain("What guests pay.");
		expect(inputTag(body)).toContain('aria-describedby="f-x-hint"');
		expect(inputTag(body)).not.toContain("aria-invalid");
	});

	it("shows the error in place of the hint and marks the control invalid", () => {
		const body = html({ hint: "What guests pay.", error: "Add a price." });
		expect(body).not.toContain("What guests pay.");
		expect(body).toContain('id="f-x-error"');
		expect(body).toContain("Add a price.");
		const tag = inputTag(body);
		expect(tag).toContain('aria-describedby="f-x-error"');
		expect(tag).toContain('aria-invalid="true"');
	});

	it("marks required fields and nothing else", () => {
		expect(html({ required: true })).toContain('class="req');
		expect(html({ required: true })).toContain("(required)");
		expect(html({})).not.toContain("(required)");
		expect(html({ optional: true })).not.toContain(">Optional<");
	});

	it("carries the width token", () => {
		expect(html({ width: "sm" })).toContain("w-sm");
		expect(html({})).toContain("w-full");
	});

	it.each(["time", "money", "date"])("wires a %s control the same way", (control) => {
		const tag = inputTag(html({ control, error: "Wrong." }));
		expect(tag).toContain('aria-describedby="f-x-error"');
		expect(tag).toContain('aria-invalid="true"');
	});

	it("puts units inside the money box and shows dates in British order", () => {
		expect(html({ control: "money" })).toContain(">£<");
		expect(inputTag(html({ control: "money" }))).toContain('inputmode="decimal"');
		expect(inputTag(html({ control: "date" }))).toContain('value="24/10/2026"');
		expect(html({ control: "date" })).toContain(">Sat<");
	});
});
