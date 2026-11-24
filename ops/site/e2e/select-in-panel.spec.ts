/**
 * A dropdown (ui/NativeSelect) inside a side panel: its list opens where the
 * field is, on screen, not off the panel's edge. Users → Add user's Role is
 * one: its list was placed for the page but drawn inside the panel, which
 * moves what's fixed inside it, and so clipped out of sight.
 */
import { expect, test } from "@playwright/test";
import { fakeApi } from "./fake-api";

test("Add user's Role opens its list under the field, where it can be seen and picked", async ({ page }) => {
	await fakeApi(page, { email: { id: 1, sections: [] } });
	await page.goto("/users");
	await page.getByRole("button", { name: "Add user" }).first().click();
	const field = page.locator("#new-user-role");
	await expect(field).toBeVisible();
	await field.click();

	const marketing = page.getByRole("option", { name: "Marketing" });
	await expect(marketing).toBeInViewport();
	const [list, under] = [await page.getByRole("listbox").boundingBox(), await field.boundingBox()];
	expect(Math.abs((list?.x ?? 0) - (under?.x ?? 0)), "the list lines up with the field").toBeLessThan(4);
	await marketing.click();
	await expect(field).toHaveText(/Marketing/);
});
