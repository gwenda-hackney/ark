import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import Button from "./Button.svelte";

function tag(props: Record<string, unknown>): string {
	const body = render(Button, { props }).body;
	return /<button[^>]*>/.exec(body)?.[0] || "";
}

describe("Button", () => {
	it("shows why it is unavailable and stays reachable", () => {
		const html = tag({ disabled: true, reason: "Save the series first", type: "submit" });
		expect(html).toContain('title="Save the series first"');
		expect(html).toContain('aria-disabled="true"');
		// Not natively disabled, so the tooltip shows on hover and it can take focus.
		expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
		// A soft-disabled submit button must not submit the form.
		expect(html).toContain('type="button"');
	});

	it("ignores the reason while it is available", () => {
		const html = tag({ disabled: false, reason: "Save the series first", title: "Send it" });
		expect(html).toContain('title="Send it"');
		expect(html).not.toContain("aria-disabled");
	});

	it("disables natively when there is no reason", () => {
		const html = tag({ disabled: true });
		expect(html).toMatch(/\sdisabled/);
		expect(html).not.toContain("aria-disabled");
	});
});
