/**
 * What's on → Enquiries: every form's replies under each form's name, and a
 * Type filter (pick one or more) to see just those.
 */
import { expect, test } from "@playwright/test";
import { fakeApi } from "./fake-api";

test("Enquiries groups by type, and the Type filter shows only the types picked", async ({ page }) => {
	await fakeApi(page, { email: { id: 1, sections: [] } });
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/forms");
	const headings = page.locator("h2.group-title");
	await expect(headings).toHaveText([/Christmas parties\s*1/, /Play at Gwenda\s*2/]);
	await expect(page.getByPlaceholder("Search names, emails and answers")).toBeVisible();

	await page.locator("#forms-filter").click();
	await page.getByRole("option", { name: "Christmas parties" }).click();
	await page.keyboard.press("Escape");
	await expect(headings).toHaveText([/Christmas parties\s*1/]);
	await expect(page.getByText("1 enquiry")).toBeVisible();
});
