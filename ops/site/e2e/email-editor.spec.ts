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
	const preview = page.frameLocator('iframe[title="The email"]');
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
	await page.frameLocator('iframe[title="The email"]').locator('tr[data-section="0"]').click();
	await expect(page.getByRole("tablist", { name: "Picture size" }).getByRole("tab", { name: "Full width" })).toHaveAttribute("aria-selected", "true");
});

test("a change to a saved email wakes Save, and after saving it sleeps until the next one (it never woke before)", async ({ page }) => {
	const { saves, preview } = await open(page);
	const save = page.getByRole("button", { name: "Save email" });
	await expect(save).toBeDisabled();
	await preview.locator('td[data-edit="copy"] p').first().click();
	await page.keyboard.press("End");
	await page.keyboard.type(" Late.");
	await expect(save).toBeEnabled();
	await save.click();
	await expect.poll(() => (saves.at(-1)?.sections as { text?: string }[] | undefined)?.[1]?.text).toBe("Doors at 9. Late.");
	await expect(save).toBeDisabled();
	await page.getByLabel("Subject").fill("Party!");
	await expect(save).toBeEnabled();
});

test("a part is picked by clicking it, then moved and removed from the bar", async ({ page }) => {
	const { saves, preview } = await open(page);
	const bar = page.getByRole("toolbar", { name: "Change the email" });
	await expect(bar.getByText("Nothing picked")).toBeVisible();
	await preview.locator('tr[data-section="1"]').click();
	await expect(bar.getByText("Text · 2 of 3")).toBeVisible();
	await bar.getByRole("button", { name: "Move up" }).click();
	await expect(bar.getByText("Text · 1 of 3")).toBeVisible();
	await expect(bar.getByRole("button", { name: "Move up" })).toBeDisabled();
	await preview.locator('tr[data-section="2"]').click();
	await bar.getByRole("button", { name: "Remove" }).click();
	await save(page);
	await expect.poll(() => saves.at(-1)?.sections).toEqual([
		{ kind: "copy", text: "Doors at 9." },
		{ kind: "heading", text: "Party" },
	]);
});

test("a + adds a heading there, ready to type into", async ({ page }) => {
	const { saves, preview } = await open(page);
	await preview.locator('tr[data-insert="1"] .ops-add').click();
	const bar = page.getByRole("toolbar", { name: "Change the email" });
	await expect(bar.getByText("Add something here")).toBeVisible();
	await bar.getByRole("button", { name: /^Heading/ }).click();
	await expect(bar.getByText("Heading · 2 of 4")).toBeVisible();
	await page.keyboard.type("Tonight");
	await page.keyboard.press("Enter");
	await save(page);
	await expect.poll(() => (saves.at(-1)?.sections as { kind: string; text?: string }[] | undefined)?.map((part) => part.text)).toEqual([
		"Party",
		"Tonight",
		"Doors at 9.",
		"",
	]);
});

test("a picture comes from our photos, then its size and description are set in the bar", async ({ page }) => {
	const { saves, preview } = await open(page);
	await preview.locator('tr[data-insert="0"] .ops-add').click();
	await page.getByRole("toolbar", { name: "Change the email" }).getByRole("button", { name: /^Picture/ }).click();
	const chooser = page.getByRole("dialog", { name: "Choose a picture" });
	await expect(chooser.getByRole("region", { name: "Chez Pickle" })).toBeVisible();
	await chooser.getByRole("button", { name: "The bar at night" }).click();
	await expect(chooser).toHaveCount(0);
	await expect(preview.locator('tr[data-section="0"] img')).toHaveAttribute("alt", "The bar at night");

	const bar = page.getByRole("toolbar", { name: "Change the email" });
	await bar.getByRole("tab", { name: "Logo" }).click();
	await bar.getByLabel("What it shows").fill("Our bar");
	await save(page);
	await expect.poll(() => (saves.at(-1)?.sections as unknown[] | undefined)?.[0]).toEqual({
		kind: "image",
		assetId: "image-aaa111-1600x1200-jpg",
		alt: "Our bar",
		size: "logo",
	});
});

test("a button's words, address and look are set in the bar; an empty one says what it needs", async ({ page }) => {
	const { saves, preview } = await open(page);
	await preview.locator('tr[data-insert="3"] .ops-add').click();
	await page.getByRole("toolbar", { name: "Change the email" }).getByRole("button", { name: /^Button/ }).click();
	await expect(preview.locator('tr[data-section="3"] [data-waiting]')).toHaveText("Button: click here to give it words and a link");
	const bar = page.getByRole("toolbar", { name: "Change the email" });
	await bar.getByLabel("Words on it").fill("See the menu");
	await bar.getByLabel("Where it goes").fill("https://gwenda.co.uk/menu");
	await expect(preview.locator('tr[data-section="3"] a')).toHaveText(/See the menu/i);
	await save(page);
	await expect.poll(() => (saves.at(-1)?.sections as unknown[] | undefined)?.[3]).toEqual({
		kind: "button",
		label: "See the menu",
		link: "https://gwenda.co.uk/menu",
		look: "link",
	});
});

test("two pictures side by side: the chooser asks for the left, then the right; a divider goes in as it is", async ({ page }) => {
	const { saves, preview } = await open(page);
	const bar = page.getByRole("toolbar", { name: "Change the email" });
	await preview.locator('tr[data-insert="1"] .ops-add').click();
	await bar.getByRole("button", { name: /^Two pictures/ }).click();
	const chooser = page.getByRole("dialog", { name: "Choose a picture" });
	await chooser.getByRole("button", { name: "The bar at night" }).click();
	// Still open, for the right one.
	await chooser.getByRole("region", { name: "Chez Pickle" }).getByRole("button").click();
	await expect(chooser).toHaveCount(0);
	await expect(preview.locator('tr[data-section="1"] img')).toHaveCount(2);

	await preview.locator('tr[data-insert="2"] .ops-add').click();
	await bar.getByRole("button", { name: /^Divider/ }).click();
	await save(page);
	await expect.poll(() => (saves.at(-1)?.sections as unknown[] | undefined)?.slice(1, 3)).toEqual([
		{
			kind: "pictures",
			pictures: [
				{ assetId: "image-aaa111-1600x1200-jpg", alt: "The bar at night" },
				{ assetId: "image-bbb222-1200x1500-jpg", alt: "Chez Pickle" },
			],
		},
		{ kind: "divider" },
	]);
});

test("an Event card shows a night from What's on, as the monthly email does", async ({ page }) => {
	const { saves, preview } = await open(page);
	await preview.locator('tr[data-insert="1"] .ops-add').click();
	await page.getByRole("toolbar", { name: "Change the email" }).getByRole("button", { name: /^Event/ }).click();
	const chooser = page.getByRole("dialog", { name: "Choose an event" });
	await chooser.getByRole("region", { name: "Nights" }).getByRole("button", { name: /Karaoke/ }).click();
	await expect(chooser).toHaveCount(0);
	await expect(preview.locator('tr[data-section="1"]')).toContainText("Karaoke");
	await expect(preview.locator('tr[data-section="1"]')).toContainText("Dec");
	await save(page);
	await expect.poll(() => (saves.at(-1)?.sections as { title?: string; date?: string }[] | undefined)?.[1]).toMatchObject({ kind: "event", title: "Karaoke", date: "2026-12-03" });
});
