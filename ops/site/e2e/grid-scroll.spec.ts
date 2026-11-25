/**
 * A list (ui/DataGrid) scrolled down: its header stays on top, solid, and
 * the rows go under it, not over it. Email → People's rows showed through
 * its column names once scrolled.
 */
import { expect, test } from "@playwright/test";
import { fakeApi } from "./fake-api";

test("Email → People scrolled down: the column names stay readable, no row drawn over them", async ({ page }) => {
	await fakeApi(page, { email: { id: 1, sections: [] } });
	await page.setViewportSize({ width: 1280, height: 700 });
	await page.goto("/email/people");
	await expect(page.getByText("guest1@example.com")).toBeVisible();

	await page.mouse.move(640, 500);
	await page.mouse.wheel(0, 600);
	await page.waitForTimeout(400);

	// The rows scroll under the header (AG Grid lays it over them), so it
	// must be solid: anything see-through lets the rows show through it.
	const header = page.locator(".ag-header").first();
	await expect(header).toBeVisible();
	const background = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
	const alpha = background.startsWith("rgba") ? Number(background.split(",").at(-1)?.replace(")", "")) : background.startsWith("rgb(") || background.startsWith("color(") ? 1 : 0;
	expect(background, "the header has a solid background").not.toBe("rgba(0, 0, 0, 0)");
	expect(alpha, `the header is opaque (${background})`).toBe(1);
});
