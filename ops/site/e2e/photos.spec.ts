/**
 * The Photos page's gallery as the owner orders it: a photo dragged to a new
 * place, with ops' one drag and drop (ui/drag-reorder.ts). The app's /api is
 * answered by the test (fake-api.ts).
 */
import { expect, test } from "@playwright/test";
import { fakeApi } from "./fake-api";

test("a photo dragged before the first goes first; the label says what's moving and a gold line shows where", async ({ page }) => {
	const saves = await fakeApi(page, { email: { id: 1, sections: [] } });
	await page.goto("/venue/gallery");
	const tiles = page.locator("li.tile[data-key]");
	await expect(tiles).toHaveCount(3);

	const seen = await page.evaluate(() => {
		const tiles = [...document.querySelectorAll<HTMLElement>("li.tile[data-key]")];
		const data = new DataTransfer();
		const first = tiles[0].getBoundingClientRect();
		const at = { clientX: first.left + 5, clientY: first.top + first.height / 2 };
		tiles[2].dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: data }));
		tiles[0].dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data, ...at }));
		// What shows while it's held: the label, and the line (both the editor's own, marked data-ops).
		const marks = [...document.querySelectorAll<HTMLElement>("body > [data-ops], body > div")].map((el) => el.textContent || "line");
		const faded = tiles[2].classList.contains("ops-dragging");
		tiles[0].dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data, ...at }));
		return { marks, faded };
	});
	expect(seen.faded).toBe(true);
	expect(seen.marks).toContain("Moving: Photo 3");
	await expect.poll(() => saves.orders.at(-1)).toEqual(["p3", "p1", "p2"]);
});
