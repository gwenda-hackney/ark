/**
 * The one-off email editor (#348) as the owner uses it: words typed straight
 * into the email's preview, Bold and Link from the bar over it, and what's
 * saved. The app's /api is answered by the test (fake-api.ts).
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
		{ kind: "heading", text: "" },
	],
};

async function open(page: Page, email: OneOffFixture = DRAFT) {
	const saves = await fakeApi(page, { email });
	await page.goto(`/email/write/${email.id}`);
	const preview = page.frameLocator('iframe[title="Preview"]');
	await expect(preview.locator('h2[data-edit="heading"]').first()).toBeVisible();
	return { saves, preview };
}

async function save(page: Page) {
	await page.getByRole("button", { name: "Save email" }).click();
}

test("a heading is typed straight into the email, and saved", async ({ page }) => {
	const { saves, preview } = await open(page);
	const heading = preview.locator('h2[data-edit="heading"]').first();
	await heading.click();
	await page.keyboard.press("ControlOrMeta+A");
	await page.keyboard.type("New Year's Eve");
	await expect(page.getByText("Type the heading. Press Enter when it's done.")).toBeVisible();
	await page.keyboard.press("Enter");

	// It stays as typed once the email is drawn again.
	await expect(preview.locator('h2[data-edit="heading"]').first()).toHaveText("New Year's Eve");
	await save(page);
	await expect.poll(() => saves.at(-1)?.sections).toEqual([
		{ kind: "heading", text: "New Year's Eve" },
		{ kind: "copy", text: "Doors at 9." },
		{ kind: "heading", text: "" },
	]);
});

test("Enter starts a new paragraph; Bold and Link come from the bar over the email", async ({ page }) => {
	const { saves, preview } = await open(page);
	await preview.locator('td[data-edit="copy"] p').first().click();
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Music till late");

	// Bold: select "Music".
	await page.keyboard.press("Home");
	for (let i = 0; i < "Music".length; i++) await page.keyboard.press("Shift+ArrowRight");
	await page.getByRole("button", { name: "Bold" }).click();

	// Link: select "late", type where it goes.
	await page.keyboard.press("End");
	for (let i = 0; i < "late".length; i++) await page.keyboard.press("Shift+ArrowLeft");
	await page.getByRole("button", { name: "Link", exact: true }).click();
	await page.getByLabel("Where the link goes").fill("gwenda.co.uk/whats-on");
	await page.getByRole("button", { name: "Add link" }).click();

	await save(page);
	await expect
		.poll(() => (saves.at(-1)?.sections as { text?: string }[] | undefined)?.[1]?.text)
		.toBe("Doors at 9.\n\n**Music** till [late](https://gwenda.co.uk/whats-on)");
});

test("an empty heading shows what to type, and can be typed into", async ({ page }) => {
	const { saves, preview } = await open(page);
	const empty = preview.locator('h2[data-edit="heading"]').nth(1);
	await expect(empty).toHaveAttribute("data-empty", "");
	await expect(empty).toHaveAttribute("data-placeholder", "Type a heading");
	await empty.click();
	await page.keyboard.type("See you there");
	await page.keyboard.press("Enter");
	await save(page);
	await expect.poll(() => (saves.at(-1)?.sections as { text?: string }[] | undefined)?.[2]?.text).toBe("See you there");
});

test("a sent email's words can't be typed over", async ({ page }) => {
	const { preview } = await open(page, { ...DRAFT, status: "sent" });
	await expect(preview.locator('h2[data-edit="heading"]').first()).not.toHaveAttribute("contenteditable", /.*/);
	await expect(page.getByText("Sent or scheduled: it can't be changed.").first()).toBeVisible();
});

test("an email whose picture was added before pictures had sizes opens (#369)", async ({ page }) => {
	await open(page, { ...DRAFT, sections: [{ kind: "image", assetId: "image-abc-10x10-jpg", alt: "The bar" }, ...DRAFT.sections] });
	await expect(page.getByText("This page hit an error")).toHaveCount(0);
	await expect(page.getByRole("tablist", { name: "Image size" })).toBeVisible();
});

test("a change in the sections beside the email can be saved (it used to change what was saved too, so Save never woke)", async ({ page }) => {
	const { saves } = await open(page);
	const save = page.getByRole("button", { name: "Save email" });
	await expect(save).toBeDisabled();
	await page.getByRole("region", { name: "Copy, section 2 of 3" }).getByRole("textbox", { name: "Text" }).fill("Doors at 10.");
	await expect(save).toBeEnabled();
	await save.click();
	await expect.poll(() => (saves.at(-1)?.sections as { text?: string }[] | undefined)?.[1]?.text).toBe("Doors at 10.");
	// Saved: nothing left to save.
	await expect(save).toBeDisabled();
});
