/**
 * The one-off email editor (#348) as the owner uses it: the email itself,
 * typed into and changed where it is; the picked part's toolbar in the
 * email; More, the side nav; and what's saved. The app's /api is answered by
 * the test (fake-api.ts).
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
	await expect(preview.locator('tr[data-insert="0"]')).toBeAttached();
	return { saves, preview };
}

async function save(page: Page) {
	await page.getByRole("button", { name: "Save email" }).click();
}

/** The last draft saved: its sections. */
const lastSections = (saves: Record<string, unknown>[]) => saves.at(-1)?.sections as Record<string, unknown>[] | undefined;

/** A + in the email, then a choice in the box it opens. */
async function addAt(page: Page, at: number, choice: RegExp) {
	await page.frameLocator('iframe[title="The email"]').locator(`tr[data-insert="${at}"] .ops-add`).click();
	await page.getByRole("dialog", { name: "Add something here" }).getByRole("button", { name: choice }).click();
}

/** A button on the picked part's toolbar, in the email. */
const tool = (page: Page, action: string) => page.frameLocator('iframe[title="The email"]').locator(`.ops-tools button[data-action="${action}"]`);

/** More, the side nav. */
const more = (page: Page) => page.getByRole("complementary", { name: "More" });

/** Drags in the email as the browser does: Playwright's own drag can't reach into the email's frame. */
async function drag(page: Page, from: string, to: string, ratio = 0.2) {
	const frame = page.frames().find((one) => one !== page.mainFrame())!;
	await frame.evaluate(
		([fromSel, toSel, at]) => {
			const source = document.querySelector(fromSel)!;
			const target = document.querySelector(toSel)!;
			const data = new DataTransfer();
			const box = target.getBoundingClientRect();
			const y = box.top + box.height * Number(at);
			source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: data }));
			target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data, clientY: y }));
			target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data, clientY: y }));
			source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: data }));
		},
		[from, to, String(ratio)],
	);
}

test("a heading is typed straight into the email, and saved", async ({ page }) => {
	const { saves, preview } = await open(page);
	const heading = preview.locator('h2[data-edit="heading"]').first();
	await heading.click();
	await page.keyboard.press("ControlOrMeta+A");
	await page.keyboard.type("New Year's Eve");
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

test("Enter starts a new paragraph; Bold and Link are on the text's toolbar in the email", async ({ page }) => {
	const { saves, preview } = await open(page);
	await preview.locator('td[data-edit="copy"] p').first().click();
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Music till late");

	// Bold: select "Music".
	await page.keyboard.press("Home");
	for (let i = 0; i < "Music".length; i++) await page.keyboard.press("Shift+ArrowRight");
	await tool(page, "bold").click();

	// Link: select "late", say where it goes.
	await page.keyboard.press("End");
	for (let i = 0; i < "late".length; i++) await page.keyboard.press("Shift+ArrowLeft");
	await tool(page, "link").click();
	await page.getByRole("dialog", { name: "Make it a link" }).getByLabel("Where it goes").fill("gwenda.co.uk/whats-on");
	await page.getByRole("button", { name: "Add link" }).click();

	await save(page);
	await expect.poll(() => lastSections(saves)?.[1]?.text).toBe("Doors at 9.\n\n**Music** till [late](https://gwenda.co.uk/whats-on)");
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
	await expect.poll(() => lastSections(saves)?.[2]?.text).toBe("See you there");
});

test("a sent email can't be changed: no typing, no toolbar, no subject", async ({ page }) => {
	const { preview } = await open(page, { ...DRAFT, status: "sent" });
	await expect(preview.locator('h2[data-edit="heading"]').first()).not.toHaveAttribute("contenteditable", /.*/);
	await preview.locator('tr[data-section="0"]').click();
	await expect(preview.locator(".ops-tools")).toHaveCount(0);
	await expect(preview.locator(".ops-add")).toHaveCount(0);
	await expect(page.getByLabel("Subject")).toBeDisabled();
});

test("an email whose picture was added before pictures had sizes opens (#369)", async ({ page }) => {
	const { preview } = await open(page, { ...DRAFT, sections: [{ kind: "image", assetId: "image-abc-10x10-jpg", alt: "The bar" }, ...DRAFT.sections] });
	await expect(page.getByText("This page hit an error")).toHaveCount(0);
	await preview.locator('tr[data-section="0"]').click();
	await tool(page, "more").click();
	await expect(more(page).getByRole("tablist", { name: "Picture size" }).getByRole("tab", { name: "Full width" })).toHaveAttribute("aria-selected", "true");
});

test("a change to a saved email wakes Save, and after saving it sleeps until the next one (it never woke before)", async ({ page }) => {
	const { saves, preview } = await open(page);
	const button = page.getByRole("button", { name: "Save email" });
	await expect(button).toBeDisabled();
	await preview.locator('td[data-edit="copy"] p').first().click();
	await page.keyboard.press("End");
	await page.keyboard.type(" Late.");
	await expect(button).toBeEnabled();
	await button.click();
	await expect.poll(() => lastSections(saves)?.[1]?.text).toBe("Doors at 9. Late.");
	await expect(button).toBeDisabled();
	await page.getByLabel("Subject").fill("Party!");
	await expect(button).toBeEnabled();
	await button.click();
	await expect.poll(() => saves.at(-1)?.subject).toBe("Party!");
});

test("a part is dragged to a new place by its handle, and removed from its toolbar", async ({ page }) => {
	const { saves, preview } = await open(page);
	// Its handle, onto the top half of the first part: it goes first.
	await drag(page, 'tr[data-section="1"] .ops-grip', 'tr[data-section="0"]', 0.2);
	await preview.locator('tr[data-section="2"]').click();
	await tool(page, "remove").click();
	await save(page);
	await expect.poll(() => lastSections(saves)).toEqual([
		{ kind: "copy", text: "Doors at 9." },
		{ kind: "heading", text: "Party" },
	]);
});

test("More slides out with the email's name and every part; picking one there picks it in the email", async ({ page }) => {
	const { saves, preview } = await open(page);
	await expect(more(page)).toHaveCount(0);
	await page.getByRole("button", { name: /^More: the email/ }).click();
	await more(page).getByLabel("Name").fill("Party promo");
	await more(page).getByRole("button", { name: /Text\s*Doors at 9\./ }).click();
	await expect(more(page).getByText("Text · 2 of 3")).toBeVisible();
	await expect(preview.locator('tr[data-section="1"]')).toHaveClass(/ops-selected/);
	await more(page).getByRole("button", { name: "Close" }).click();
	await expect(more(page)).toHaveCount(0);
	await save(page);
	await expect.poll(() => saves.at(-1)?.name).toBe("Party promo");
});

test("a + adds a heading there, ready to type into", async ({ page }) => {
	const { saves } = await open(page);
	await addAt(page, 1, /^Heading/);
	await page.keyboard.type("Tonight");
	await page.keyboard.press("Enter");
	await save(page);
	await expect.poll(() => lastSections(saves)?.map((part) => part.text)).toEqual(["Party", "Tonight", "Doors at 9.", ""]);
});

test("a picture comes from our photos; its size and description are in More", async ({ page }) => {
	const { saves, preview } = await open(page);
	await addAt(page, 0, /^Picture/);
	const chooser = page.getByRole("dialog", { name: "Choose a picture" });
	await expect(chooser.getByRole("region", { name: "Chez Pickle" })).toBeVisible();
	await chooser.getByRole("button", { name: "The bar at night" }).click();
	await expect(chooser).toHaveCount(0);
	await expect(preview.locator('tr[data-section="0"] img')).toHaveAttribute("alt", "The bar at night");

	await tool(page, "more").click();
	await more(page).getByRole("tab", { name: "Logo" }).click();
	await more(page).getByLabel("What it shows").fill("Our bar");
	await save(page);
	await expect.poll(() => lastSections(saves)?.[0]).toEqual({ kind: "image", assetId: "image-aaa111-1600x1200-jpg", alt: "Our bar", size: "logo" });
});

test("a button's words, address and look are in More; an empty one says what it needs", async ({ page }) => {
	const { saves, preview } = await open(page);
	await addAt(page, 3, /^Button/);
	await expect(preview.locator('tr[data-section="3"] [data-waiting]')).toHaveText("Button: click here to give it words and a link");
	await tool(page, "more").click();
	await more(page).getByLabel("Words on it").fill("See the menu");
	await more(page).getByLabel("Where it goes").fill("https://gwenda.co.uk/menu");
	await expect(preview.locator('tr[data-section="3"] a')).toHaveText(/See the menu/i);
	await save(page);
	await expect.poll(() => lastSections(saves)?.[3]).toEqual({ kind: "button", label: "See the menu", link: "https://gwenda.co.uk/menu", look: "link" });
});

test("a Row: a picture from our photos and our logo side by side, swapped by dragging one onto the other", async ({ page }) => {
	const { saves, preview } = await open(page);
	await addAt(page, 1, /^Row/);
	await expect(preview.locator('tr[data-section="1"] td[data-cell] [data-waiting]')).toHaveCount(2);
	await tool(page, "more").click();
	await more(page).getByRole("tablist", { name: "Cell 1 holds" }).getByRole("tab", { name: "Picture" }).click();
	await page.getByRole("dialog", { name: "Choose a picture" }).getByRole("button", { name: "The bar at night" }).click();
	await more(page).getByRole("tablist", { name: "Cell 2 holds" }).getByRole("tab", { name: "Our logo" }).click();
	await expect(preview.locator('tr[data-section="1"] img')).toHaveCount(2);

	await drag(page, 'tr[data-section="1"] td[data-cell="0"]', 'tr[data-section="1"] td[data-cell="1"]');
	await addAt(page, 2, /^Divider/);
	await save(page);
	await expect.poll(() => lastSections(saves)?.slice(1, 3)).toEqual([
		{ kind: "row", cells: [{ kind: "logo" }, { kind: "picture", assetId: "image-aaa111-1600x1200-jpg", alt: "The bar at night" }] },
		{ kind: "divider" },
	]);
});

test("a picture made \"Gwenda ×\" before Rows opens as a Row: our logo, ×, the picture", async ({ page }) => {
	const { preview } = await open(page, { ...DRAFT, sections: [{ kind: "image", assetId: "image-abc-10x10-jpg", alt: "Pinsa A Roma", size: "collab" }] });
	await expect(preview.locator('tr[data-section="0"] td[data-cell]')).toHaveCount(3);
	await page.getByRole("button", { name: /^More: the email/ }).click();
	await expect(more(page).getByRole("button", { name: /Row\s*Our logo · × · Pinsa A Roma/ })).toBeVisible();
});

test("an Event card shows a night from What's on, as the monthly email does", async ({ page }) => {
	const { saves, preview } = await open(page);
	await addAt(page, 1, /^Event/);
	const chooser = page.getByRole("dialog", { name: "Choose an event" });
	await chooser.getByRole("region", { name: "Nights" }).getByRole("button", { name: /Karaoke/ }).click();
	await expect(chooser).toHaveCount(0);
	await expect(preview.locator('tr[data-section="1"]')).toContainText("Karaoke");
	await expect(preview.locator('tr[data-section="1"]')).toContainText("Dec");
	await save(page);
	await expect.poll(() => lastSections(saves)?.[1]).toMatchObject({ kind: "event", title: "Karaoke", date: "2026-12-03" });
});
