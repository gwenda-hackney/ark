/**
 * The one-off email editor (#348) as the owner uses it. The app's /api is
 * answered by the test (fake-api.ts).
 */
import { expect, test, type Page } from "@playwright/test";
import { fakeApi, type OneOffFixture } from "./fake-api";

const DRAFT: OneOffFixture = {
	id: 1,
	name: "Party",
	subject: "Party at Gwenda",
	sections: [
		{ kind: "heading", text: "Party" },
		{ kind: "copy", text: "Doors at 9." },
	],
};

async function open(page: Page, email: OneOffFixture = DRAFT) {
	const saves = await fakeApi(page, { email });
	await page.goto(`/email/write/${email.id}`);
	await expect(page.getByRole("button", { name: "Save email" })).toBeVisible();
	return { saves };
}

test("a change to an email's sections can be saved (it used to change what was saved too, so Save never woke)", async ({ page }) => {
	const { saves } = await open(page);
	const save = page.getByRole("button", { name: "Save email" });
	await expect(save).toBeDisabled();
	await page.getByRole("region", { name: "Copy, section 2 of 2" }).getByRole("textbox", { name: "Text" }).fill("Doors at 10.");
	await expect(save).toBeEnabled();
	await save.click();
	await expect.poll(() => (saves.at(-1)?.sections as { text?: string }[] | undefined)?.[1]?.text).toBe("Doors at 10.");
	// Saved: nothing left to save, until the next change.
	await expect(save).toBeDisabled();
	await page.getByRole("region", { name: "Heading, section 1 of 2" }).getByRole("textbox", { name: "Text" }).fill("Party!");
	await expect(save).toBeEnabled();
});
